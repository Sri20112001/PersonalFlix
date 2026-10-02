use crate::api;
use crate::db;
use crate::seed;
use crate::settings::{self, Settings};
use crate::state::AppState;
use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde_json::json;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tauri::Manager;

pub async fn start(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let mut settings = Settings::load();

    let library_path = settings
        .library_path()
        .filter(|p| p.exists() && (p.join("scenes_db.json").exists() || p.join("performers").exists()))
        .or_else(settings::detect_library_path)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")));

    let lib_str = library_path.to_string_lossy().to_string();
    if settings.library_path.as_deref() != Some(&lib_str) {
        settings.library_path = Some(lib_str);
        settings.save();
    }

    let port = settings.server_port();
    let db = db::open(&Settings::db_path())?;
    seed::seed_if_empty(&db, &library_path);

    let thumbnails_path = {
        let p1 = library_path
            .join("netflix-app")
            .join("backend")
            .join("public")
            .join("thumbnails");
        if p1.exists() {
            p1
        } else {
            library_path.join("thumbnails")
        }
    };
    let performers_path = {
        let p1 = library_path.join("performers");
        if p1.exists() {
            p1
        } else {
            library_path
                .join("netflix-app")
                .join("backend")
                .join("public")
                .join("performers")
        }
    };
    // Studio logos: <library>/studios/<studioId>.(svg|png|jpg|jpeg|webp).
    // Missing files simply 404 and the UI falls back to the letter monogram.
    let studios_path = library_path.join("studios");

    let state = AppState {
        db,
        library_path,
        thumbnails_path,
        performers_path,
        studios_path,
        fetch_jobs: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        transcribe_jobs: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        transcribe_batch: std::sync::Arc::new(std::sync::Mutex::new(None)),
        app_handle: app.clone(),
    };

    // Best-effort scheduled backup (daily/weekly). Never blocks startup.
    crate::api::backup::maybe_auto_backup(&state);

    let app_router = Router::new()
        .route(
            "/api/health",
            get(|| async { axum::Json(json!({ "ok": true, "status": "ok" })) }),
        )
        .route("/api/pending-open", get(pending_open))
        .route("/thumbnails/{file}", get(get_thumbnail))
        .nest("/api", api::router())
        .nest_service("/performers", ServeDir::new(state.performers_path.clone()))
        .nest_service("/studios", ServeDir::new(state.studios_path.clone()))
        .fallback(spa)
        .layer(CorsLayer::permissive())
        .with_state(state.clone());

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!("PersonalFlix server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app_router).await?;
    Ok(())
}

/// Drain a file path handed to the app by the OS before the UI was ready.
/// The frontend polls this once on boot; the value is taken (cleared).
async fn pending_open(State(state): State<AppState>) -> axum::Json<serde_json::Value> {
    use crate::PendingOpen;
    let file = match state.app_handle.try_state::<PendingOpen>() {
        Some(s) => s.0.lock().ok().and_then(|mut g| g.take()),
        None => None,
    };
    axum::Json(json!({ "file": file }))
}

/// Serve a thumbnail or generate it on demand using ffmpeg if missing.
async fn get_thumbnail(
    State(state): State<AppState>,
    axum::extract::Path(file): axum::extract::Path<String>,
) -> Response {
    let thumb_path = state.thumbnails_path.join(&file);
    if thumb_path.exists() {
        if let Ok(bytes) = tokio::fs::read(&thumb_path).await {
            return (
                [(header::CONTENT_TYPE, "image/jpeg")],
                bytes,
            ).into_response();
        }
    }

    // Try on-demand extraction via ffmpeg if not found on disk
    if let Some(stem) = file.strip_suffix(".jpg").or_else(|| file.strip_suffix(".jpeg")) {
        if let Ok(id) = stem.parse::<i64>() {
            let file_path: Option<String> = {
                let conn = state.db.lock().unwrap();
                conn.query_row(
                    "SELECT file_path FROM scenes WHERE id = ?1",
                    rusqlite::params![id],
                    |r| r.get(0),
                ).ok()
            };
            if let Some(fp) = file_path {
                if let Some(vpath) = crate::api::resolve_video_path(&state.library_path, &fp) {
                    if vpath.exists() {
                        let _ = tokio::fs::create_dir_all(&state.thumbnails_path).await;
                        let out = std::process::Command::new("ffmpeg")
                            .args([
                                "-y",
                                "-ss", "00:00:10",
                                "-i", &vpath.to_string_lossy(),
                                "-vframes", "1",
                                "-q:v", "3",
                                &thumb_path.to_string_lossy(),
                            ])
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .status();

                        if out.map(|s| s.success()).unwrap_or(false) && thumb_path.exists() {
                            if let Ok(bytes) = tokio::fs::read(&thumb_path).await {
                                return (
                                    [(header::CONTENT_TYPE, "image/jpeg")],
                                    bytes,
                                ).into_response();
                            }
                        }
                    }
                }
            }
        }
    }

    StatusCode::NOT_FOUND.into_response()
}

/// Serve the embedded frontend (single-page app) from Tauri's asset resolver.
async fn spa(State(state): State<AppState>, request: axum::extract::Request) -> Response {
    let path = request.uri().path().trim_start_matches('/');
    let rel = if path.is_empty() { "index.html".to_string() } else { path.to_string() };
    let resolver = state.app_handle.asset_resolver();

    let body = resolver
        .get(rel.clone())
        .or_else(|| resolver.get("index.html".to_string()))
        .map(|a| a.bytes.to_vec());

    match body {
        Some(bytes) => {
            let ct = content_type_for_path(&rel);
            Response::builder()
                .header(header::CONTENT_TYPE, ct)
                .header(header::CACHE_CONTROL, "no-cache")
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn content_type_for_path(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "txt" => "text/plain",
        "map" => "application/json",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}