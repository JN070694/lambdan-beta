use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;
use chrono::Utc;
use flate2::read::GzDecoder;
use tar::Archive;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::LambdanError;
use crate::models::ReferenceImage;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub quizzes_imported: usize,
    pub folder_id: Option<String>,
    pub folder_name: Option<String>,
    pub folder_was_created: bool,
}

fn prettify(stem: &str) -> String {
    stem.replace(['-', '_'], " ")
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_image(name: &str) -> bool {
    matches!(
        Path::new(name).extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
        Some("png") | Some("jpg") | Some("jpeg") | Some("webp")
    )
}

fn parse_bracket_reference(fname: &str) -> Option<ReferenceImage> {
    let stem = Path::new(fname).file_stem()?.to_str()?;
    if stem.starts_with('[') && stem.ends_with(']') {
        let name = stem[1..stem.len()-1].to_string();
        Some(ReferenceImage {
            key: stem.to_string(),
            number: 0,
            display_label: name.clone(),
            name,
            file_path: String::new(),
        })
    } else {
        None
    }
}

fn infer_type(option_a: &str, option_b: &str, option_c: &str, option_d: &str, option_e: &str) -> String {
    // Explicit marker
    if option_a.trim().eq_ignore_ascii_case("show answer") {
        return "ESSAY".into();
    }
    // All options empty = essay
    if option_a.trim().is_empty() && option_b.trim().is_empty()
        && option_c.trim().is_empty() && option_d.trim().is_empty()
        && option_e.trim().is_empty()
    {
        return "ESSAY".into();
    }
    // True/False
    if option_a.trim().eq_ignore_ascii_case("true")
        && option_b.trim().eq_ignore_ascii_case("false")
        && option_c.trim().is_empty()
    {
        return "TF".into();
    }
    "MC".into()
}

fn nid_base(stem: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)^(n\d+)[a-z]?$").ok()?;
    let caps = re.captures(stem)?;
    Some(caps[1].to_lowercase())
}

#[tauri::command]
pub async fn import_pack(
    app: AppHandle,
    path: String,
    folder_id: Option<String>,
) -> std::result::Result<ImportResult, LambdanError> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| LambdanError::Custom(e.to_string()))?;
    let ref_dir = data_dir.join("references");
    let nid_dir = data_dir.join("nids");
    std::fs::create_dir_all(&ref_dir)?;
    std::fs::create_dir_all(&nid_dir)?;

    let tmp_dir = data_dir.join(format!("tmp_{}", Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir)?;

    let p = Path::new(&path);
    let is_tar = path.ends_with(".tar.gz") || path.ends_with(".tgz");
    let is_csv = path.ends_with(".csv");

    let tar_stem = p.file_name().and_then(|n| n.to_str()).unwrap_or("import")
        .trim_end_matches(".tar.gz")
        .trim_end_matches(".tgz")
        .trim_end_matches(".gz")
        .to_string();

    if is_csv {
        let fname = p.file_name().unwrap();
        std::fs::copy(&path, tmp_dir.join(fname))?;
    } else if is_tar {
        let file = std::fs::File::open(&path)?;
        let gz = GzDecoder::new(file);
        let mut archive = Archive::new(gz);
        for entry in archive.entries()? {
            let mut entry = entry?;
            let entry_path = entry.path()?.to_path_buf();
            let components: Vec<_> = entry_path.components().collect();
            if components.is_empty() { continue; }

            let fname = match entry_path.file_name() {
                Some(f) => f.to_os_string(),
                None => continue,
            };

            let parent_is_media = components.len() >= 2 && {
                let parent = components[components.len() - 2]
                    .as_os_str().to_string_lossy().to_lowercase();
                parent == "media"
            };

            if parent_is_media {
                let media_tmp = tmp_dir.join("media");
                std::fs::create_dir_all(&media_tmp)?;
                entry.unpack(media_tmp.join(&fname)).ok();
            } else if components.len() == 1
                || (components.len() == 2
                    && components[0].as_os_str().to_string_lossy().to_lowercase() != "media")
            {
                entry.unpack(tmp_dir.join(&fname)).ok();
            }
        }
    } else {
        std::fs::remove_dir_all(&tmp_dir)?;
        return Err(LambdanError::Custom("Unsupported file type. Use .tar.gz or .csv".into()));
    }

    let mut csv_paths: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(&tmp_dir)? {
        let entry = entry?;
        let fpath = entry.path();
        if fpath.is_dir() { continue; }
        if fpath.extension().and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("csv")).unwrap_or(false)
        {
            csv_paths.push(fpath);
        }
    }

    let mut nid_map: HashMap<String, Vec<(String, PathBuf)>> = HashMap::new();
    let mut reference_images: Vec<ReferenceImage> = Vec::new();

    let media_tmp = tmp_dir.join("media");
    if media_tmp.exists() {
        for entry in std::fs::read_dir(&media_tmp)? {
            let entry = entry?;
            let fname = entry.file_name().to_string_lossy().to_string();
            let fpath = entry.path();

            if !is_image(&fname) { continue; }

            let stem = Path::new(&fname).file_stem()
                .and_then(|s| s.to_str()).unwrap_or("").to_string();

            if stem.starts_with('[') && stem.ends_with(']') {
                if let Some(mut ri) = parse_bracket_reference(&fname) {
                    let dest = ref_dir.join(&fname);
                    std::fs::copy(&fpath, &dest)?;
                    ri.file_path = dest.to_string_lossy().to_string();
                    reference_images.push(ri);
                }
            } else if let Some(base) = nid_base(&stem.to_lowercase()) {
                let dest = nid_dir.join(&fname);
                std::fs::copy(&fpath, &dest)?;
                nid_map.entry(base).or_default().push((stem.to_lowercase(), dest));
            }
        }
    }

    reference_images.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    for (i, ri) in reference_images.iter_mut().enumerate() {
        ri.number = (i + 1) as i64;
        ri.display_label = format!("{} — {}", i + 1, ri.name);
    }

    csv_paths.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    if csv_paths.is_empty() {
        std::fs::remove_dir_all(&tmp_dir)?;
        return Err(LambdanError::Custom("No CSV files found".into()));
    }

    for variants in nid_map.values_mut() {
        variants.sort_by(|a, b| a.0.cmp(&b.0));
    }

    let multi = csv_paths.len() > 1;
    let conn = db::get().lock().unwrap();
    let imported_at = Utc::now().to_rfc3339();
    let references_json = serde_json::to_string(&reference_images)?;

    let (effective_folder_id, folder_name, folder_was_created) = if multi {
        let pretty = prettify(&tar_stem);
        let existing: Option<String> = conn.query_row(
            "SELECT id FROM folders WHERE lower(name) = lower(?1) LIMIT 1",
            params![pretty], |row| row.get(0),
        ).ok();
        if let Some(fid) = existing {
            (Some(fid), Some(pretty), false)
        } else {
            let fid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO folders (id, name, created_at) VALUES (?1,?2,?3)",
                params![fid, pretty, imported_at],
            )?;
            (Some(fid), Some(pretty), true)
        }
    } else {
        match folder_id {
            Some(ref fid) if !fid.is_empty() => {
                let exists: bool = conn.query_row(
                    "SELECT COUNT(*) FROM folders WHERE id=?1",
                    params![fid],
                    |r| r.get::<_, i64>(0),
                ).unwrap_or(0) > 0;
                if exists {
                    let name: Option<String> = conn.query_row(
                        "SELECT name FROM folders WHERE id=?1",
                        params![fid], |r| r.get(0),
                    ).ok();
                    (Some(fid.clone()), name, false)
                } else {
                    (None, None, false)
                }
            }
            _ => (None, None, false),
        }
    };

    let mut total_imported = 0usize;
    for csv_path in &csv_paths {
        let title = csv_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let file_name = csv_path.file_name().unwrap_or_default().to_string_lossy().to_string();

        // Resolve quiz ID: reuse existing if same title+folder, otherwise new
        let existing_id: Option<String> = conn.query_row(
            "SELECT id FROM quizzes WHERE lower(title)=lower(?1) AND (folder_id IS ?2 OR folder_id=?2) LIMIT 1",
            params![title, effective_folder_id],
            |r| r.get(0),
        ).ok();
        let quiz_id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());

        // Delete existing questions so reimport is clean
        conn.execute("DELETE FROM questions WHERE quiz_id=?1", params![quiz_id])?;

        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(false).flexible(true).trim(csv::Trim::All)
            .from_path(csv_path)?;

        let mut question_count = 0i64;
        for record in rdr.records() {
            let r = record?;
            let get = |i: usize| r.get(i).unwrap_or("").trim().to_string();

            let nid = get(10).to_lowercase();
            let group = get(9);
            let explanation = get(8);
            let option_a = get(2);
            let option_b = get(3);
            let option_c = get(4);
            let question_type = infer_type(&option_a, &option_b, &option_c, &get(5), &get(6));

            let (image_path, nid_variants_json) = if !nid.is_empty() {
                let base = nid_base(&nid).unwrap_or(nid.clone());
                if let Some(variants) = nid_map.get(&base) {
                    let paths: Vec<String> = variants.iter()
                        .map(|(_, p)| p.to_string_lossy().to_string())
                        .collect();
                    let first = paths.first().cloned();
                    (first, serde_json::to_string(&paths).unwrap_or("[]".into()))
                } else {
                    (None, "[]".into())
                }
            } else {
                (None, "[]".into())
            };

            let qid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO questions
                 (id, quiz_id, question_number, question_text, option_a, option_b, option_c,
                  option_d, option_e, correct_answer, nid, image_path, nid_variants, grp, question_type, explanation)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                params![
                    qid, quiz_id, get(0), get(1),
                    option_a, option_b, option_c, get(5), get(6),
                    get(7), nid, image_path, nid_variants_json,
                    group, question_type, explanation
                ],
            )?;
            question_count += 1;
        }

        conn.execute(
            "INSERT OR REPLACE INTO quizzes
             (id, title, csv_file_name, question_count, imported_at, reference_images, folder_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                quiz_id, title, file_name, question_count,
                imported_at, references_json, effective_folder_id
            ],
        )?;
        total_imported += 1;
    }

    std::fs::remove_dir_all(&tmp_dir)?;

    Ok(ImportResult {
        quizzes_imported: total_imported,
        folder_id: effective_folder_id,
        folder_name,
        folder_was_created,
    })
}
