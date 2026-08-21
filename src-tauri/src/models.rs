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
    pub explanation: String,
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
    #[serde(default)]
    pub question_number: String,
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
    #[serde(default = "default_shuffle_answers")]
    pub shuffle_answers: bool,
    #[serde(default = "default_display_scale")]
    pub display_scale: String,
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_icon_style() -> String { "xbox".to_string() }
fn default_shuffle_answers() -> bool { true }
fn default_display_scale() -> String { "auto".to_string() }
fn default_theme() -> String { "default".to_string() }

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
    #[serde(default = "default_ls")]
    pub ls: u32,
    #[serde(default = "default_rs")]
    pub rs: u32,
}

fn default_lt() -> u32 { 6 }
fn default_rt() -> u32 { 7 }
fn default_ls() -> u32 { 10 }
fn default_rs() -> u32 { 11 }

impl Default for GamepadMapping {
    fn default() -> Self {
        Self {
            select: 0, back: 1, skip_correct: 3, skip_incorrect: 2,
            media: 4, references: 5, pause: 9, score: 8,
            lt: 6, rt: 7, ls: 10, rs: 11,
        }
    }
}
