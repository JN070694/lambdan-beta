use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub quiz_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Quiz {
    pub id: String,
    pub title: String,
    pub csv_file_name: String,
    pub question_count: i64,
    pub imported_at: String,
    pub reference_images: Vec<ReferenceImage>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceImage {
    pub key: String,
    pub number: i64,
    pub name: String,
    pub display_label: String,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub quiz_id: String,
    pub question_number: String,
    pub question_text: String,
    pub option_a: String,
    pub option_b: String,
    pub option_c: String,
    pub option_d: String,
    pub option_e: String,
    pub correct_answer: String,
    pub nid: String,
    pub image_path: Option<String>,
    pub nid_variants: Vec<String>,
    pub group: String,
    pub question_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub quiz_id: String,
    pub quiz_title: String,
    pub date: String,
    pub score: i64,
    pub total: i64,
    pub percentage: f64,
    pub time_seconds: i64,
    pub question_results: Vec<QuestionResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionResult {
    pub question_id: String,
    pub question_text: String,
    pub correct: bool,
    pub user_answer: String,
    pub correct_answer: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub instant_feedback: bool,
    pub shuffle_questions: bool,
    pub until_correct_mode: bool,
    #[serde(default = "default_icon_style")]
    pub button_icon_style: String,
}

fn default_icon_style() -> String { "xbox".to_string() }

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GamepadMapping {
    pub select: u32,
    pub back: u32,
    pub skip_correct: u32,
    pub skip_incorrect: u32,
    pub media: u32,
    pub references: u32,
    pub pause: u32,
    pub score: u32,
    #[serde(default = "default_lt")]
    pub lt: u32,
    #[serde(default = "default_rt")]
    pub rt: u32,
}

fn default_lt() -> u32 { 6 }
fn default_rt() -> u32 { 7 }

impl Default for GamepadMapping {
    fn default() -> Self {
        Self {
            select: 0, back: 1, skip_correct: 2, skip_incorrect: 3,
            media: 4, references: 5, pause: 9, score: 8,
            lt: 6, rt: 7,
        }
    }
}
