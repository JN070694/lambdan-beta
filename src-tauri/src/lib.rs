mod commands;
mod db;
mod error;
mod models;
mod sleep_guard;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(data_dir.join("references"))?;
            std::fs::create_dir_all(data_dir.join("nids"))?;
            db::init(data_dir.join("lambdan.db"))
                .map_err(|e| Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other, e.to_string()
                )) as Box<dyn std::error::Error>)?;

            // Held in managed state for the app's whole lifetime so the OS
            // doesn't sleep/lock the screen out from under an active quiz.
            // NOTE: this is not released just by the process "exiting" —
            // see commands::app::quit and the window event handler below,
            // both of which explicitly call .stop() on it before ever
            // hard-exiting the process.
            app.manage(sleep_guard::SleepGuard::start());

            // Covers the OS window-close button (the X), which doesn't go
            // through our `quit` command. Without this, closing the window
            // this way still leaves the sleep-inhibitor child process
            // running in the background after LAMBDAn is gone.
            if let Some(window) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        if let Some(guard) = handle.try_state::<sleep_guard::SleepGuard>() {
                            guard.stop();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::quit,
            commands::import::import_pack,
            commands::quiz::get_folders,
            commands::quiz::create_folder,
            commands::quiz::rename_folder,
            commands::quiz::delete_folder,
            commands::quiz::move_quiz_to_folder,
            commands::quiz::get_all_quizzes,
            commands::quiz::get_questions,
            commands::quiz::delete_quiz,
            commands::quiz::save_history,
            commands::quiz::get_history,
            commands::quiz::get_history_entry,
            commands::quiz::delete_history_entry,
            commands::quiz::clear_all_history,
            commands::quiz::get_settings,
            commands::quiz::save_settings,
            commands::quiz::get_gamepad_mapping,
            commands::quiz::save_gamepad_mapping,
            commands::quiz::export_missed,
        ])
        .run(tauri::generate_context!())
        .expect("error running LAMBDAn");
}
