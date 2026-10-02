use crate::api::resolve_video_path;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use rusqlite::params;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

pub fn routes() -> Router<AppState> {
    Router::new().route("/{id}", get(stream))
}

fn content_type_for(ext: &str) -> &'static str {
    match ext {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "ogg" => "video/ogg",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        _ => "video/mp4",
    }
}

async fn stream(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> Result<Response<Body>, StatusCode> {
    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .ok()
    };
    let Some(file_path) = file_path else {
        return Err(StatusCode::NOT_FOUND);
    };
    let Some(path) = resolve_video_path(&state.library_path, &file_path) else {
        return Err(StatusCode::NOT_FOUND);
    };

    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let size = file.metadata().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?.len();

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_lowercase();
    let content_type = content_type_for(&ext);

    let mut builder = Response::builder()
        .header("Content-Type", content_type)
        .header("Accept-Ranges", "bytes");

    let range_header = headers
        .get(axum::http::header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    if let Some(rh) = range_header {
        if let Some((start, end)) = parse_range(&rh, size) {
            if start >= size {
                return Err(StatusCode::RANGE_NOT_SATISFIABLE);
            }
            let end = end.min(size - 1);
            let len = end - start + 1;
            builder = builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header("Content-Range", format!("bytes {}-{}/{}", start, end, size))
                .header("Content-Length", len);
            file.seek(std::io::SeekFrom::Start(start))
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let stream = ReaderStream::new(file.take(len));
            return builder.body(Body::from_stream(stream)).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    builder = builder.status(StatusCode::OK).header("Content-Length", size);
    let stream = ReaderStream::new(file);
    builder.body(Body::from_stream(stream)).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn parse_range(range: &str, size: u64) -> Option<(u64, u64)> {
    if size == 0 {
        return None;
    }
    let range = range.strip_prefix("bytes=")?;
    let (start_s, end_s) = range.split_once('-')?;
    if start_s.is_empty() {
        // suffix range: last N bytes (e.g. bytes=-500)
        let n: u64 = end_s.parse().ok()?;
        if n == 0 {
            return None;
        }
        let start = size.saturating_sub(n);
        let end = size.saturating_sub(1);
        Some((start, end))
    } else {
        let start: u64 = start_s.parse().ok()?;
        let end: u64 = if end_s.is_empty() {
            size.saturating_sub(1)
        } else {
            end_s.parse().ok()?
        };
        if start > end {
            return None;
        }
        Some((start, end))
    }
}