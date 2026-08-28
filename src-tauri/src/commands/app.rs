use crate::sleep_guard::SleepGuard;
use tauri::State;

/// Releases the sleep-prevention lock and *then* exits. This must be used
/// instead of `@tauri-apps/plugin-process`'s `exit()` everywhere in the
/// frontend — that call maps to `std::process::exit()`, which terminates
/// the process immediately without running `Drop`, leaving the sleep
/// guard's child process (systemd-inhibit on Linux, caffeinate on macOS)
/// orphaned and still holding the OS sleep lock indefinitely.
#[tauri::command]
pub fn quit(sleep_guard: State<SleepGuard>) {
    sleep_guard.stop();
    std::process::exit(0);
}
