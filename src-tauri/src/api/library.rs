use crate::api::download;
use crate::api::reconcile;
use crate::api::resolve_video_path;
use crate::scanner;
use crate::state::AppState;
use axum::extract::{Query, State};
use std::collections::HashMap;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tauri_plugin_opener::OpenerExt;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/stats", get(stats))
        .route("/mapping-audit", get(mapping_audit))
        .route("/scan", post(scan))
        .route("/review-queue", get(review_queue))
        .route("/reconcile", post(reconcile_library))
        .route("/reveal", post(reveal))
        .route("/prune", post(prune_missing))
        .route("/fetch-backfill", post(download::backfill_performers))
        .nest("/fetch", download::routes())
}

async fn stats(State(state): State<AppState>) -> axum::Json<Value> {
    axum::Json(scanner::stats(&state))
}

async fn scan(State(state): State<AppState>) -> axum::Json<Value> {
    axum::Json(serde_json::to_value(scanner::scan_library(&state.db, &state.library_path)).unwrap_or_else(|_| json!({})))
}

/// Phase-0 read-only mapping audit (performer ↔ scene ↔ studio).
async fn mapping_audit(State(state): State<AppState>) -> axum::Json<Value> {
    axum::Json(scanner::mapping_audit(&state.db, &state.library_path))
}

/// Phase-3 Metadata Review Queue: paged bucket of scenes needing human
/// assignment. Query: `?bucket=needs_performers|needs_studio|needs_both|needs_review&page=&limit=`.
async fn review_queue(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> axum::Json<Value> {
    let bucket = q.get("bucket").map(|s| s.as_str()).unwrap_or("needs_performers");
    let bucket = match bucket {
        "needs_performers" | "needs_studio" | "needs_both" | "needs_review" => bucket,
        _ => "needs_performers",
    };
    let page = q.get("page").and_then(|p| p.parse().ok()).unwrap_or(1);
    let limit = q.get("limit").and_then(|p| p.parse().ok()).unwrap_or(50);
    axum::Json(scanner::review_queue(&state.db, &state.library_path, bucket, page, limit))
}

/// Phase-2A reconciliation. Body `{}` or `{"dry_run": true}` (default) only
/// REPORTS. `{"dry_run": false}` applies the same plan in one transaction.
async fn reconcile_library(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let dry = body.get("dry_run").and_then(|v| v.as_bool()).unwrap_or(true);
    if dry {
        Ok(Json(
            serde_json::to_value(reconcile::dry_run(&state.db, &state.library_path))
                .unwrap_or_else(|_| json!({})),
        ))
    } else {
        reconcile::apply(&state.db, &state.library_path)
            .map(|r| Json(serde_json::to_value(r).unwrap_or_else(|_| json!({}))))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}

/// Reveal a scene's file (or the library root) in the OS file manager.
/// Body: `{ "scene_id": 123 }` or `{ "path": "..." }` or `{}` for library root.
async fn reveal(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let target: Option<std::path::PathBuf> = if let Some(id) = body["scene_id"].as_i64() {
        let conn = state.db.lock().unwrap();
        let file_path: Option<String> = conn
            .query_row(
                "SELECT file_path FROM scenes WHERE id = ?1",
                rusqlite::params![id],
                |r| r.get(0),
            )
            .ok()
            .flatten();
        drop(conn);
        file_path
            .as_deref()
            .and_then(|fp| resolve_video_path(&state.library_path, fp))
    } else if let Some(p) = body["path"].as_str() {
        resolve_video_path(&state.library_path, p)
    } else {
        None
    };

    // Reveal the file itself; fall back to its parent dir, then library root.
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(t) = target {
        candidates.push(t);
    }
    candidates.push(state.library_path.clone());
    for c in &candidates {
        if c.exists() {
            let reveal_target = if c.is_file() { c.clone() } else { c.clone() };
            if state.app_handle.opener().reveal_item_in_dir(&reveal_target).is_ok() {
                return Ok(Json(json!({ "ok": true, "path": reveal_target.to_string_lossy() })));
            }
            // Fall through: try the parent directory directly.
            if let Some(parent) = c.parent() {
                if state.app_handle.opener().reveal_item_in_dir(parent).is_ok() {
                    return Ok(Json(json!({ "ok": true, "path": parent.to_string_lossy() })));
                }
            }
        }
    }
    Err(StatusCode::NOT_FOUND)
}

/// Delete scenes whose files are missing from disk, plus their related rows
/// (comments, timestamps, tracking), playlist memberships, and scene-type
/// favorites. Body: `{}` prunes every `file_exists=0` scene;
/// `{ "ids": [1,2] }` prunes only those ids. All-or-nothing transaction.
async fn prune_missing(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let mut conn = state.db.lock().unwrap();
    let ids: Vec<i64> = if let Some(arr) = body.get("ids").and_then(|v| v.as_array()) {
        arr.iter()
            .filter_map(|v| {
                v.as_i64().or_else(|| {
                    v.as_str().and_then(|s| s.parse().ok())
                })
            })
            .collect()
    } else {
        conn.prepare("SELECT id FROM scenes WHERE file_exists = 0")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .query_map([], |r| r.get(0))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .flatten()
            .collect()
    };
    if ids.is_empty() {
        return Ok(Json(json!({ "ok": true, "removed": 0, "ids": [] })));
    }
    let tx = conn.transaction().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let res = (|| -> rusqlite::Result<()> {
        let ph = vec!["?"; ids.len()].join(",");
        let args = rusqlite::params_from_iter(ids.iter());
        tx.execute(
            &format!("DELETE FROM comments WHERE scene_id IN ({ph})"),
            args.clone(),
        )?;
        tx.execute(
            &format!("DELETE FROM timestamps WHERE scene_id IN ({ph})"),
            args.clone(),
        )?;
        tx.execute(
            &format!("DELETE FROM tracking WHERE scene_id IN ({ph})"),
            args.clone(),
        )?;
        tx.execute(&format!("DELETE FROM scenes WHERE id IN ({ph})"), args.clone())?;
        // Drop pruned ids from playlist scene lists.
        {
            let mut stmt = tx.prepare("SELECT id, scene_ids FROM playlists")?;
            let pls: Vec<(i64, String)> = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .flatten()
                .collect();
            drop(stmt);
            for (pid, raw) in pls {
                let cur: Vec<serde_json::Value> =
                    serde_json::from_str(&raw).unwrap_or_default();
                let kept: Vec<&serde_json::Value> = cur
                    .iter()
                    .filter(|v| {
                        let n = v
                            .as_i64()
                            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                            .unwrap_or(-1);
                        !ids.contains(&n)
                    })
                    .collect();
                if kept.len() != cur.len() {
                    let s = serde_json::to_string(&kept).unwrap_or_else(|_| "[]".into());
                    tx.execute(
                        "UPDATE playlists SET scene_ids = ?1 WHERE id = ?2",
                        rusqlite::params![s, pid],
                    )?;
                }
            }
        }
        // Drop scene-type favorites pointing at pruned scenes.
        {
            let strs: Vec<String> = ids.iter().map(|n| n.to_string()).collect();
            let ph2 = vec!["?"; strs.len()].join(",");
            tx.execute(
                &format!("DELETE FROM favorites WHERE type = 'scene' AND target_id IN ({ph2})"),
                rusqlite::params_from_iter(strs.iter()),
            )?;
        }
        Ok(())
    })();
    match res {
        Ok(()) => {
            tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            Ok(Json(json!({ "ok": true, "removed": ids.len(), "ids": ids })))
        }
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}
