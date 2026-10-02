pub mod analytics;
pub mod backup;
pub mod categories;
pub mod collections;
pub mod comments;
pub mod download;
pub mod faces;
pub mod favorites;
pub mod graph;
pub mod integrity;
pub mod library;
pub mod performers;
pub mod playlists;
pub mod reconcile;
pub mod scenes;
pub mod search;
pub mod settings;
pub mod studios;
pub mod timestamps;
pub mod tracking;
pub mod transcribe;
pub mod subtitles;
pub mod video;
pub mod watch_events;

use crate::state::AppState;
use axum::Router;
use serde_json::Value;
use std::path::PathBuf;

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/backup", backup::routes())
        .nest("/analytics", analytics::routes())
        .nest("/collections", collections::routes())
        .nest("/scenes", scenes::routes())
        .nest("/performers", performers::routes())
        .nest("/categories", categories::routes())
        .nest("/studios", studios::routes())
        .nest("/comments", comments::routes())
        .nest("/timestamps", timestamps::routes())
        .nest("/tracking", tracking::routes())
        .nest("/subtitles", subtitles::routes())
        .nest("/transcribe", transcribe::routes())
        .nest("/watch-events", watch_events::routes())
        .nest("/favorites", favorites::routes())
        .nest("/faces", faces::routes())
        .nest("/playlists", playlists::routes())
        .nest("/search", search::routes())
        .nest("/video", video::routes())
        .nest("/library", library::routes())
        .nest("/graph", graph::routes())
        .nest("/settings", settings::routes())
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Parse a JSON-array TEXT column back into a JSON value.
pub fn jcol(col: Option<String>) -> Value {
    match col {
        Some(x) => serde_json::from_str(&x).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

/// Convert a JSON value into a SQLite parameter value without adding
/// extra quotation marks to strings.
pub fn json_val_to_sqlite(v: &Value) -> rusqlite::types::Value {
    match v {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                rusqlite::types::Value::Text(n.to_string())
            }
        }
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => rusqlite::types::Value::Text(v.to_string()),
    }
}

/// Resolve a scene's `file_path` ("Porn/Studio/File.mp4") to an absolute path
/// inside the configured library root.
pub fn resolve_video_path(library_path: &std::path::Path, file_path: &str) -> Option<PathBuf> {
    let p = std::path::Path::new(file_path);
    if p.is_absolute() && p.exists() {
        return Some(p.to_path_buf());
    }
    let mut rel = file_path;
    if let Some(lib_name) = library_path.file_name().and_then(|s| s.to_str()) {
        if let Some(rest) = rel.strip_prefix(lib_name) {
            rel = rest;
        }
    }
    let rel = rel
        .strip_prefix("Porn/")
        .or_else(|| rel.strip_prefix("Porn\\"))
        .unwrap_or(rel);
    let rel = rel.trim_start_matches('/').trim_start_matches('\\');

    let joined = library_path.join(rel);
    if joined.exists() {
        return Some(joined);
    }

    let norm = rel.replace('/', std::path::MAIN_SEPARATOR_STR).replace('\\', std::path::MAIN_SEPARATOR_STR);
    let joined_norm = library_path.join(norm);
    if joined_norm.exists() {
        return Some(joined_norm);
    }

    if let Some(fname) = std::path::Path::new(file_path).file_name() {
        let direct = library_path.join(fname);
        if direct.exists() {
            return Some(direct);
        }
    }

    Some(joined)
}