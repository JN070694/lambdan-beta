//! Keeps the OS from sleeping (or locking the screen) for as long as
//! LAMBDAn is running. Created once in `lib.rs`'s `setup()` and stored in
//! Tauri's managed state so it lives — and keeps its platform-specific
//! inhibitor held — for the whole life of the app; it's released
//! automatically when the app exits and this value drops.
//!
//! Platform-specific:
//! - Windows: `SetThreadExecutionState` only holds until the next call (or
//!   until the calling thread exits), so a background thread re-asserts it
//!   every 30s for as long as the guard is alive.
//! - macOS: spawns `caffeinate -dis` and keeps the child process running;
//!   killing it (on drop) releases the sleep assertion.
//! - Linux: spawns `systemd-inhibit ... sleep infinity`, which holds a
//!   logind inhibitor lock for as long as that child process runs; killing
//!   it (on drop) releases the lock. If `systemd-inhibit` isn't available
//!   (non-systemd distros), this logs a warning and the app simply runs
//!   without sleep prevention rather than failing to start.

#[cfg(target_os = "windows")]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(esFlags: u32) -> u32;
    }

    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
    const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

    pub struct SleepGuard {
        running: Arc<AtomicBool>,
    }

    impl SleepGuard {
        pub fn start() -> Self {
            let running = Arc::new(AtomicBool::new(true));
            let running_thread = running.clone();
            thread::spawn(move || {
                while running_thread.load(Ordering::Relaxed) {
                    unsafe {
                        SetThreadExecutionState(
                            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED,
                        );
                    }
                    thread::sleep(Duration::from_secs(30));
                }
                // Hand execution-state control back to the system default.
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS);
                }
            });
            SleepGuard { running }
        }
    }

    impl Drop for SleepGuard {
        fn drop(&mut self) {
            self.running.store(false, Ordering::Relaxed);
        }
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use std::process::{Child, Command};

    pub struct SleepGuard {
        child: Option<Child>,
    }

    impl SleepGuard {
        pub fn start() -> Self {
            // -d: prevent display sleep, -i: prevent idle sleep, -s: prevent
            // system sleep (on AC power). Held for as long as this process runs.
            let child = Command::new("caffeinate").arg("-dis").spawn().ok();
            if child.is_none() {
                log::warn!("caffeinate unavailable, sleep prevention disabled");
            }
            SleepGuard { child }
        }
    }

    impl Drop for SleepGuard {
        fn drop(&mut self) {
            if let Some(mut c) = self.child.take() {
                let _ = c.kill();
            }
        }
    }
}

#[cfg(target_os = "linux")]
mod imp {
    use std::process::{Child, Command};

    pub struct SleepGuard {
        child: Option<Child>,
    }

    impl SleepGuard {
        pub fn start() -> Self {
            // systemd-inhibit holds a logind inhibitor lock for as long as the
            // command it wraps keeps running — `sleep infinity` just keeps
            // that lock open for this process's lifetime.
            let child = Command::new("systemd-inhibit")
                .args([
                    "--what=idle:sleep:handle-lid-switch",
                    "--who=LAMBDAn",
                    "--why=Quiz in progress",
                    "sleep",
                    "infinity",
                ])
                .spawn()
                .ok();
            if child.is_none() {
                log::warn!("systemd-inhibit unavailable, sleep prevention disabled");
            }
            SleepGuard { child }
        }
    }

    impl Drop for SleepGuard {
        fn drop(&mut self) {
            if let Some(mut c) = self.child.take() {
                let _ = c.kill();
            }
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod imp {
    pub struct SleepGuard;

    impl SleepGuard {
        pub fn start() -> Self {
            log::warn!("sleep prevention not implemented for this platform");
            SleepGuard
        }
    }
}

pub use imp::SleepGuard;
