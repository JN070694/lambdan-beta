use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use crate::error::Result;

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

pub fn init(path: PathBuf) -> Result<()> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            csv_file_name TEXT NOT NULL,
            question_count INTEGER NOT NULL DEFAULT 0,
            imported_at TEXT NOT NULL,
            reference_images TEXT NOT NULL DEFAULT '[]',
            folder_id TEXT
        );

        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            quiz_id TEXT NOT NULL,
            question_number TEXT NOT NULL,
            question_text TEXT NOT NULL,
            option_a TEXT NOT NULL DEFAULT '',
            option_b TEXT NOT NULL DEFAULT '',
            option_c TEXT NOT NULL DEFAULT '',
            option_d TEXT NOT NULL DEFAULT '',
            option_e TEXT NOT NULL DEFAULT '',
            correct_answer TEXT NOT NULL,
            nid TEXT NOT NULL DEFAULT '',
            image_path TEXT,
            nid_variants TEXT NOT NULL DEFAULT '[]',
            grp TEXT NOT NULL DEFAULT '',
            question_type TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            quiz_id TEXT NOT NULL,
            quiz_title TEXT NOT NULL,
            date TEXT NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            percentage REAL NOT NULL,
            time_seconds INTEGER NOT NULL,
            question_results TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS gamepad_mapping (
            id INTEGER PRIMARY KEY DEFAULT 1,
            mapping_json TEXT NOT NULL
        );
    ")?;

    DB.set(Mutex::new(conn)).ok();
    Ok(())
}

pub fn get() -> &'static Mutex<Connection> {
    DB.get().expect("DB not initialized")
}
