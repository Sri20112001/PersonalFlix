//! Face-aware thumbnails (uniface sidecar).
//!
//! Slice 1 of the uniface integration: pick the video frame with the
//! largest, most confident face as the scene thumbnail instead of a fixed
//! 10s ffmpeg grab. The heavy lifting lives in the Python sidecar
//! (`scripts/face_thumbs/pick_thumbnail.py`, venv + weights under
//! `<data>/tools/face`); this module only discovers the interpreter,
//! serializes runs (face inference saturates the CPU), and parses the
//! sidecar's single-line JSON result.
//!
//! - GET  `/api/faces/status`      → engine availability
//! - POST `/api/faces/thumb-smart` → `{scene_id, force?, candidates?}`

use crate::settings::Settings;
use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use std::path::PathBuf;

/// One smart-thumb run at a time (SCRFD already saturates all cores).
/// Tokio mutex: the guard is held across sidecar awaits, so it must be Send.
static RUN_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/status", get(status))
        .route("/thumb-smart", post(smart_thumb))
}

/// `<data>/tools/face` — venv + (later) relocatable face models live here,
/// mirroring the whisper `tools/whisper` layout.
pub fn face_root() -> PathBuf {
    Settings::data_dir().join("tools").join("face")
}

fn venv_python() -> PathBuf {
    face_root().join("venv").join("Scripts").join("python.exe")
}

/// Preferred interpreter: face venv first, then PATH fallbacks.
fn find_python() -> Option<PathBuf> {
    let v = venv_python();
    if v.exists() {
        return Some(v);
    }
    for cand in ["python", "python3"] {
        if std::process::Command::new(cand)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Some(PathBuf::from(cand));
        }
    }
    None
}

/// Locate the sidecar script: bundled resources (release) first, then the
/// repo checkout (dev: walk up from the exe looking for scripts/).
fn find_script(state: &AppState) -> Option<PathBuf> {
    use tauri::Manager;
    if let Ok(res) = state.app_handle.path().resource_dir() {
        for rel in [
            "face_thumbs/pick_thumbnail.py",
            "pick_thumbnail.py",
            "scripts/face_thumbs/pick_thumbnail.py",
        ] {
            let p = res.join(rel);
            if p.exists() {
                return Some(p);
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..8 {
            if let Some(d) = &dir {
                let p = d.join("scripts").join("face_thumbs").join("pick_thumbnail.py");
                if p.exists() {
                    return Some(p);
                }
                dir = d.parent().map(|p| p.to_path_buf());
            } else {
                break;
            }
        }
    }
    None
}

fn uniface_version(python: &std::path::Path) -> Option<String> {
    let out = std::process::Command::new(python)
        .args(["-c", "import uniface; print(getattr(uniface, '__version__', 'ok'))"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

async fn status(State(state): State<AppState>) -> Json<Value> {
    let python = find_python();
    let script = find_script(&state);
    let version = python.as_deref().and_then(uniface_version);
    Json(json!({
        "available": python.is_some() && script.is_some() && version.is_some(),
        "root": face_root().to_string_lossy(),
        "python": python.map(|p| p.to_string_lossy().to_string()),
        "script": script.map(|p| p.to_string_lossy().to_string()),
        "uniface": version,
        "hint": "run scripts/face_thumbs/setup.ps1 to install the sidecar",
    }))
}

/// Pull the sidecar's single-line JSON result out of its stdout
/// (uniface may log to stderr; stdout stays machine-readable).
fn parse_pick_output(stdout: &str) -> Result<Value, String> {
    stdout
        .lines()
        .rev()
        .find(|l| {
            let t = l.trim();
            t.starts_with('{') && t.ends_with('}')
        })
        .ok_or_else(|| "sidecar printed no JSON".to_string())
        .and_then(|l| serde_json::from_str(l).map_err(|e| format!("bad sidecar JSON: {e}")))
}

fn clamp_candidates(n: Option<u32>) -> u32 {
    n.unwrap_or(12).clamp(4, 24)
}

async fn smart_thumb(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let _run = RUN_LOCK.try_lock().map_err(|_| StatusCode::CONFLICT)?;

    let scene_id = body["scene_id"]
        .as_i64()
        .or_else(|| body["scene_id"].as_str().and_then(|s| s.parse().ok()))
        .ok_or(StatusCode::BAD_REQUEST)?;
    let force = body["force"].as_bool().unwrap_or(false);

    let python = find_python().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let script = find_script(&state).ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            rusqlite::params![scene_id],
            |r| r.get(0),
        )
        .ok()
        .flatten()
    };
    let fp = file_path.ok_or(StatusCode::NOT_FOUND)?;
    let video = crate::api::resolve_video_path(&state.library_path, &fp)
        .filter(|p| p.exists())
        .ok_or(StatusCode::NOT_FOUND)?;

    let thumb_path = state.thumbnails_path.join(format!("{scene_id}.jpg"));
    if thumb_path.exists() && !force {
        return Ok(Json(json!({ "ok": true, "skipped": true, "scene_id": scene_id })));
    }
    let _ = std::fs::create_dir_all(&state.thumbnails_path);

    let out = tokio::process::Command::new(&python)
        .args([
            script.to_string_lossy().as_ref(),
            "--video",
            &video.to_string_lossy(),
            "--out",
            &thumb_path.to_string_lossy(),
            "--candidates",
            &clamp_candidates(body["candidates"].as_u64().map(|n| n as u32)).to_string(),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();
    // Generous ceiling: N ffmpeg seeks + N CPU inferences on long files.
    let proc = tokio::time::timeout(std::time::Duration::from_secs(900), out)
        .await
        .map_err(|_| StatusCode::REQUEST_TIMEOUT)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !proc.status.success() || !thumb_path.exists() {
        let tail = String::from_utf8_lossy(&proc.stderr);
        let tail: String = tail.lines().rev().take(5).collect::<Vec<_>>().join("\n");
        return Ok(Json(json!({
            "ok": false, "scene_id": scene_id,
            "error": "sidecar failed", "stderr": tail,
        })));
    }
    let mut result =
        parse_pick_output(&String::from_utf8_lossy(&proc.stdout)).unwrap_or(json!({ "ok": true }));
    result["scene_id"] = json!(scene_id);
    result["thumb"] = json!(format!("/thumbnails/{scene_id}.jpg"));
    Ok(Json(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sidecar_json_line() {
        let v = parse_pick_output("noise\n{\"ok\": true, \"faces\": 2}\n").unwrap();
        assert_eq!(v["faces"], 2);
        assert!(parse_pick_output("no json here").is_err());
        assert!(parse_pick_output("{\"ok\": false,").is_err());
    }

    #[test]
    fn candidates_are_clamped() {
        assert_eq!(clamp_candidates(None), 12);
        assert_eq!(clamp_candidates(Some(1)), 4);
        assert_eq!(clamp_candidates(Some(100)), 24);
        assert_eq!(clamp_candidates(Some(8)), 8);
    }

    #[test]
    fn face_root_is_under_data_dir() {
        assert_eq!(
            face_root(),
            Settings::data_dir().join("tools").join("face")
        );
    }
}
