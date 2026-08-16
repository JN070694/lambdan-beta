use rusqlite::params;
use uuid::Uuid;
use chrono::Utc;

use crate::db;
use crate::error::LambdanError;
use crate::models::{Folder, Quiz, Question, ReferenceImage, HistoryEntry, QuestionResult, AppSettings, GamepadMapping};

// ── Folders ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_folders() -> std::result::Result<Vec<Folder>, LambdanError> {
    let conn = db::get().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT f.id, f.name, f.created_at, COUNT(q.id) as quiz_count
         FROM folders f LEFT JOIN quizzes q ON q.folder_id = f.id
         GROUP BY f.id ORDER BY lower(f.name) ASC"
    )?;
    let result: Vec<Folder> = stmt.query_map([], |row| {
        Ok(Folder { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)?, quiz_count: row.get(3)? })
    })?.filter_map(|r| r.ok()).collect();
    Ok(result)
}

#[tauri::command]
pub async fn create_folder(name: String) -> std::result::Result<Folder, LambdanError> {
    let conn = db::get().lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    conn.execute("INSERT INTO folders (id, name, created_at) VALUES (?1,?2,?3)", params![id, name, created_at])?;
    Ok(Folder { id, name, created_at, quiz_count: 0 })
}

#[tauri::command]
pub async fn rename_folder(folder_id: String, name: String) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    conn.execute("UPDATE folders SET name=?1 WHERE id=?2", params![name, folder_id])?;
    Ok(())
}

#[tauri::command]
pub async fn delete_folder(folder_id: String) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    conn.execute("DELETE FROM folders WHERE id=?1", params![folder_id])?;
    Ok(())
}

#[tauri::command]
pub async fn move_quiz_to_folder(quiz_id: String, folder_id: Option<String>) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    conn.execute("UPDATE quizzes SET folder_id=?1 WHERE id=?2", params![folder_id, quiz_id])?;
    Ok(())
}

// ── Quizzes ───────────────────────────────────────────────────────────────────

fn map_quiz(row: &rusqlite::Row) -> rusqlite::Result<Quiz> {
    let res_json: String = row.get(5)?;
    let reference_images: Vec<ReferenceImage> = serde_json::from_str(&res_json).unwrap_or_default();
    Ok(Quiz {
        id: row.get(0)?, title: row.get(1)?, csv_file_name: row.get(2)?,
        question_count: row.get(3)?, imported_at: row.get(4)?,
        reference_images, folder_id: row.get(6)?,
    })
}

#[tauri::command]
pub async fn get_all_quizzes() -> std::result::Result<Vec<Quiz>, LambdanError> {
    let conn = db::get().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, title, csv_file_name, question_count, imported_at, reference_images, folder_id
         FROM quizzes ORDER BY lower(title) ASC"
    )?;
    let result: Vec<Quiz> = stmt.query_map([], map_quiz)?.filter_map(|r| r.ok()).collect();
    Ok(result)
}

#[tauri::command]
pub async fn get_questions(quiz_id: String) -> std::result::Result<Vec<Question>, LambdanError> {
    let conn = db::get().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, quiz_id, question_number, question_text, option_a, option_b, option_c,
         option_d, option_e, correct_answer, nid, image_path, nid_variants, grp, question_type
         FROM questions WHERE quiz_id=?1 ORDER BY CAST(question_number AS INTEGER)"
    )?;
    let result: Vec<Question> = stmt.query_map(params![quiz_id], |row| {
        let variants_json: String = row.get(12)?;
        let nid_variants: Vec<String> = serde_json::from_str(&variants_json).unwrap_or_default();
        Ok(Question {
            id: row.get(0)?, quiz_id: row.get(1)?, question_number: row.get(2)?,
            question_text: row.get(3)?, option_a: row.get(4)?, option_b: row.get(5)?,
            option_c: row.get(6)?, option_d: row.get(7)?, option_e: row.get(8)?,
            correct_answer: row.get(9)?, nid: row.get(10)?, image_path: row.get(11)?,
            nid_variants, group: row.get(13)?, question_type: row.get(14)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(result)
}

#[tauri::command]
pub async fn delete_quiz(quiz_id: String) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    conn.execute("DELETE FROM quizzes WHERE id=?1", params![quiz_id])?;
    Ok(())
}

// ── History ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_history(entry: HistoryEntry) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    let results_json = serde_json::to_string(&entry.question_results)?;
    conn.execute(
        "INSERT INTO history (id, quiz_id, quiz_title, date, score, total, percentage, time_seconds, question_results)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![entry.id, entry.quiz_id, entry.quiz_title, entry.date,
                entry.score, entry.total, entry.percentage, entry.time_seconds, results_json],
    )?;
    conn.execute(
        "DELETE FROM history WHERE quiz_id=?1 AND id NOT IN (
            SELECT id FROM history WHERE quiz_id=?1 ORDER BY date DESC LIMIT 5
        )",
        params![entry.quiz_id],
    )?;
    Ok(())
}

fn map_history(row: &rusqlite::Row) -> rusqlite::Result<HistoryEntry> {
    let results_json: String = row.get(8)?;
    let question_results: Vec<QuestionResult> = serde_json::from_str(&results_json).unwrap_or_default();
    Ok(HistoryEntry {
        id: row.get(0)?, quiz_id: row.get(1)?, quiz_title: row.get(2)?,
        date: row.get(3)?, score: row.get(4)?, total: row.get(5)?,
        percentage: row.get(6)?, time_seconds: row.get(7)?, question_results,
    })
}

#[tauri::command]
pub async fn get_history(quiz_id: Option<String>) -> std::result::Result<Vec<HistoryEntry>, LambdanError> {
    let conn = db::get().lock().unwrap();
    match quiz_id {
        Some(qid) => {
            let mut stmt = conn.prepare(
                "SELECT id, quiz_id, quiz_title, date, score, total, percentage, time_seconds, question_results
                 FROM history WHERE quiz_id=?1 ORDER BY date DESC"
            )?;
            let result: Vec<HistoryEntry> = stmt.query_map(params![qid], map_history)?.filter_map(|r| r.ok()).collect();
            Ok(result)
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT id, quiz_id, quiz_title, date, score, total, percentage, time_seconds, question_results
                 FROM history ORDER BY date DESC"
            )?;
            let result: Vec<HistoryEntry> = stmt.query_map([], map_history)?.filter_map(|r| r.ok()).collect();
            Ok(result)
        }
    }
}

#[tauri::command]
pub async fn get_history_entry(entry_id: String) -> std::result::Result<HistoryEntry, LambdanError> {
    let conn = db::get().lock().unwrap();
    let entry = conn.query_row(
        "SELECT id, quiz_id, quiz_title, date, score, total, percentage, time_seconds, question_results
         FROM history WHERE id=?1",
        params![entry_id], map_history,
    )?;
    Ok(entry)
}

#[tauri::command]
pub async fn delete_history_entry(entry_id: String) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    conn.execute("DELETE FROM history WHERE id=?1", params![entry_id])?;
    Ok(())
}

// ── Settings ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_settings() -> std::result::Result<AppSettings, LambdanError> {
    let conn = db::get().lock().unwrap();
    let instant: bool = conn.query_row(
        "SELECT value FROM settings WHERE key='instant_feedback'",
        [], |r| r.get::<_, String>(0),
    ).map(|v| v == "true").unwrap_or(true);
    let shuffle: bool = conn.query_row(
        "SELECT value FROM settings WHERE key='shuffle_questions'",
        [], |r| r.get::<_, String>(0),
    ).map(|v| v == "true").unwrap_or(false);
    let until_correct: bool = conn.query_row(
        "SELECT value FROM settings WHERE key='until_correct_mode'",
        [], |r| r.get::<_, String>(0),
    ).map(|v| v == "true").unwrap_or(false);
    let icon_style: String = conn.query_row(
        "SELECT value FROM settings WHERE key='button_icon_style'",
        [], |r| r.get::<_, String>(0),
    ).unwrap_or_else(|_| "xbox".to_string());
    Ok(AppSettings {
        instant_feedback: instant, shuffle_questions: shuffle,
        until_correct_mode: until_correct, button_icon_style: icon_style,
    })
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('instant_feedback', ?1)",
        params![if settings.instant_feedback { "true" } else { "false" }],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('shuffle_questions', ?1)",
        params![if settings.shuffle_questions { "true" } else { "false" }],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('until_correct_mode', ?1)",
        params![if settings.until_correct_mode { "true" } else { "false" }],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('button_icon_style', ?1)",
        params![settings.button_icon_style],
    )?;
    Ok(())
}

// ── Gamepad ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_gamepad_mapping() -> std::result::Result<GamepadMapping, LambdanError> {
    let conn = db::get().lock().unwrap();
    let json: Option<String> = conn.query_row(
        "SELECT mapping_json FROM gamepad_mapping WHERE id=1",
        [], |r| r.get(0),
    ).ok();
    match json {
        Some(j) => Ok(serde_json::from_str(&j).unwrap_or_default()),
        None => Ok(GamepadMapping::default()),
    }
}

#[tauri::command]
pub async fn save_gamepad_mapping(mapping: GamepadMapping) -> std::result::Result<(), LambdanError> {
    let conn = db::get().lock().unwrap();
    let json = serde_json::to_string(&mapping)?;
    conn.execute(
        "INSERT OR REPLACE INTO gamepad_mapping (id, mapping_json) VALUES (1, ?1)",
        params![json],
    )?;
    Ok(())
}

// ── Export ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn export_missed(
    entry_id: String,
    output_path: String,
) -> std::result::Result<String, LambdanError> {
    let entry = get_history_entry(entry_id).await?;
    let missed_ids: Vec<String> = entry.question_results.iter()
        .filter(|r| !r.correct)
        .map(|r| r.question_id.clone())
        .collect();

    if missed_ids.is_empty() {
        return Err(LambdanError::Custom("No missed questions to export".into()));
    }

    let conn = db::get().lock().unwrap();
    let mut questions: Vec<Question> = Vec::new();
    for qid in &missed_ids {
        if let Ok(q) = conn.query_row(
            "SELECT id, quiz_id, question_number, question_text, option_a, option_b, option_c,
             option_d, option_e, correct_answer, nid, image_path, nid_variants, grp, question_type
             FROM questions WHERE id=?1",
            params![qid],
            |row| {
                let variants_json: String = row.get(12)?;
                let nid_variants: Vec<String> = serde_json::from_str(&variants_json).unwrap_or_default();
                Ok(Question {
                    id: row.get(0)?, quiz_id: row.get(1)?, question_number: row.get(2)?,
                    question_text: row.get(3)?, option_a: row.get(4)?, option_b: row.get(5)?,
                    option_c: row.get(6)?, option_d: row.get(7)?, option_e: row.get(8)?,
                    correct_answer: row.get(9)?, nid: row.get(10)?, image_path: row.get(11)?,
                    nid_variants, group: row.get(13)?, question_type: row.get(14)?,
                })
            }
        ) { questions.push(q); }
    }

    // Build the CSV in the exact same 10-column format used for import
    let mut csv_rows = String::new();
    for q in &questions {
        let fields = [&q.question_number, &q.question_text, &q.option_a, &q.option_b,
                      &q.option_c, &q.option_d, &q.option_e, &q.correct_answer, &q.group, &q.nid];
        let row: Vec<String> = fields.iter().map(|f| {
            if f.contains(',') || f.contains('"') || f.contains('\n') {
                format!("\"{}\"", f.replace('"', "\"\""))
            } else { f.to_string() }
        }).collect();
        csv_rows.push_str(&row.join(","));
        csv_rows.push('\n');
    }

    let out_path = if output_path.ends_with(".csv") { output_path.clone() }
                   else { format!("{}.csv", output_path) };

    std::fs::write(&out_path, csv_rows)?;
    Ok(out_path)
}
