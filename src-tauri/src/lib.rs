mod api;
mod db;
mod scanner;
mod seed;
mod server;
mod settings;
mod state;

use tauri::{Emitter, Manager};

/// A file path handed to the app by the OS (file association) before the
/// frontend was ready. The frontend polls `GET /api/pending-open` on boot to
/// recover it, so the deep link can't be lost to a startup race.
pub(crate) struct PendingOpen(pub(crate) std::sync::Mutex<Option<String>>);

pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second instance opened a video file (argv[1] is the path).
            if let Some(p) = argv.get(1) {
                if let Some(s) = app.try_state::<PendingOpen>() {
                    *s.0.lock().unwrap() = Some(p.clone());
                }
                let _ = app.emit("open-file", p);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(PendingOpen(std::sync::Mutex::new(None)));

            let handle = app.handle().clone();
            let window = app.get_webview_window("main");
            #[cfg(not(debug_assertions))]
            let port = settings::Settings::load().server_port();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::start(handle).await {
                    eprintln!("[server] fatal: {e}");
                }
            });

            // Dev (`tauri dev`): the window already points at the Vite dev
            // server (devUrl) with HMR — just show it. Navigating away would
            // yank the window onto the stale embedded bundle and kill HMR.
            #[cfg(debug_assertions)]
            if let Some(w) = window {
                let _ = w.show();
            }
            // Release: the window starts hidden; reveal it only once the
            // embedded server is accepting connections, then navigate to it
            // so the UI never flashes a blank/error screen while starting up.
            #[cfg(not(debug_assertions))]
            if let Some(w) = window {
                tauri::async_runtime::spawn(async move {
                    let addr = format!("127.0.0.1:{port}");
                    for _ in 0..100 {
                        if tokio::net::TcpStream::connect(&addr).await.is_ok() {
                            break;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                    let _ = w.show();
                    let _ = w.navigate(format!("http://{addr}").parse::<tauri::Url>().unwrap());
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}