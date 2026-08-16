use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LambdanError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Custom(String),
}

impl Serialize for LambdanError {
    fn serialize<S>(&self, s: S) -> std::result::Result<S::Ok, S::Error>
    where S: serde::Serializer {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, LambdanError>;
