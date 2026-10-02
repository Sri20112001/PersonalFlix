use crate::api::now_iso;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Allowed session-log events. `seek` records a position jump (the segment
/// keeps running if playback continues); `heartbeat` extends an open segment
/// so crashes/sleeps stay bounded; `pause`/`ended` close it.
const ALLOWED: &[&str] = &["play", "pause", "seek", "ended", "heartbeat"];

/// Max wall-clock seconds credited between two consecutive events while
/// playing. Bounds background-tab / sleep gaps between heartbeats.
const STEP_CAP_SECS: f64 = 60.0;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(log).get(list))
        .route("/stats", get(stats))
}

fn event_from_row(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "scene_id": row.get::<_, i64>(1)?,
        "event": row.get::<_, String>(2)?,
        "currentTime": row.get::<_, f64>(3)?,
        "duration": row.get::<_, Option<f64>>(4)?,
        "created_at": row.get::<_, String>(5)?,
    }))
}

async fn log(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    let scene_id = body["scene_id"].as_i64().or_else(|| body["sceneId"].as_i64());
    let event = body["event"]
        .as_str()
        .map(str::to_string)
        .or_else(|| body["type"].as_str().map(str::to_string));
    let (Some(scene_id), Some(event)) = (scene_id, event) else {
        return Err(StatusCode::BAD_REQUEST);
    };
    if !ALLOWED.contains(&event.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let current_time = body["currentTime"]
        .as_f64()
        .or_else(|| body["current_time"].as_f64())
        .unwrap_or(0.0)
        .max(0.0);
    let duration = body["duration"].as_f64().filter(|d| *d > 0.0);
    let created_at = now_iso();
    let conn = state.db.lock().unwrap();
    let ok = conn
        .execute(
            "INSERT INTO watch_events (scene_id, event, current_time, duration, created_at)
             VALUES (?1,?2,?3,?4,?5)",
            params![scene_id, event, current_time, duration, created_at],
        )
        .is_ok();
    if !ok {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let id = conn.last_insert_rowid();
    let ev = conn
        .query_row(
            "SELECT id, scene_id, event, current_time, duration, created_at FROM watch_events WHERE id = ?1",
            params![id],
            event_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::CREATED, Json(ev)))
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let (sql, param): (String, Option<i64>) = match query.get("scene_id").or_else(|| query.get("sceneId")) {
        Some(s) => match s.parse::<i64>() {
            Ok(id) => (
                "SELECT id, scene_id, event, current_time, duration, created_at FROM watch_events WHERE scene_id = ?1 ORDER BY id DESC LIMIT 500".to_string(),
                Some(id),
            ),
            Err(_) => return Json(Value::Array(vec![])),
        },
        None => (
            "SELECT id, scene_id, event, current_time, duration, created_at FROM watch_events ORDER BY id DESC LIMIT 200".to_string(),
            None,
        ),
    };
    let mut stmt = conn.prepare(&sql).unwrap();
    let rows: Vec<Value> = match param {
        Some(id) => stmt
            .query_map(params![id], event_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect(),
        None => stmt
            .query_map([], event_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect(),
    };
    Json(Value::Array(rows))
}

/// Walk the session log and credit wall-clock time between consecutive events
/// while `playing == true`. `play` opens, `pause`/`ended` close, `heartbeat`
/// and `seek` extend (seek only records the jump). Each step is capped so a
/// lost close event can't credit hours.
pub(crate) fn exact_seconds_for_range(
    conn: &Connection,
    since_sql: &str,
) -> (f64, i64, i64) {
    let sql = format!(
        "SELECT event, created_at FROM watch_events WHERE {} ORDER BY created_at ASC, id ASC",
        since_sql
    );
    let mut playing = false;
    let mut last_ts: Option<chrono::DateTime<chrono::Utc>> = None;
    let mut total = 0.0;
    let mut sessions = 0;
    let parse = |s: &str| {
        chrono::DateTime::parse_from_rfc3339(s)
            .map(|d| d.with_timezone(&chrono::Utc))
            .ok()
    };
    if let Ok(mut stmt) = conn.prepare(&sql) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        }) {
            for row in rows.flatten() {
                let (ev, ts_raw) = row;
                let ts = match parse(&ts_raw) {
                    Some(t) => t,
                    None => continue,
                };
                if playing {
                    if let Some(prev) = last_ts {
                        let dt = (ts - prev).num_milliseconds() as f64 / 1000.0;
                        if dt > 0.0 {
                            total += dt.min(STEP_CAP_SECS);
                        }
                    }
                }
                match ev.as_str() {
                    "play" => {
                        if !playing {
                            sessions += 1;
                        }
                        playing = true;
                    }
                    "pause" | "ended" => playing = false,
                    _ => {}
                }
                last_ts = Some(ts);
            }
        }
    }
    let events: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM watch_events WHERE {}", since_sql),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    (total, sessions, events)
}

/// (total, today, last7d, last30d, sessions_all, events_all) — shared with analytics.
pub(crate) fn exact_totals(conn: &Connection) -> (f64, f64, f64, f64, i64, i64) {
    let (total, sessions, events) = exact_seconds_for_range(conn, "1 = 1");
    let (today, _, _) =
        exact_seconds_for_range(conn, "date(created_at) = date('now')");
    let (d7, _, _) =
        exact_seconds_for_range(conn, "date(created_at) >= date('now','-6 days')");
    let (d30, _, _) =
        exact_seconds_for_range(conn, "date(created_at) >= date('now','-29 days')");
    (total, today, d7, d30, sessions, events)
}

async fn stats(State(state): State<AppState>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let (total, today, d7, d30, sessions, events) = exact_totals(&conn);
    // Top scenes by exact seconds: attribute each playing-step to the scene
    // that owns its closing event (approximation; heartbeats carry scene_id).
    let mut top: Vec<Value> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT scene_id, COUNT(*) FROM watch_events WHERE event = 'play' GROUP BY scene_id ORDER BY COUNT(*) DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        }) {
            for r in rows.flatten() {
                let title: String = conn
                    .query_row(
                        "SELECT COALESCE(title, file_name, '') FROM scenes WHERE id = ?1",
                        params![r.0],
                        |rr| rr.get(0),
                    )
                    .unwrap_or_default();
                top.push(json!({ "scene_id": r.0, "title": title, "plays": r.1 }));
            }
        }
    }
    Json(json!({
        "totalSeconds": total,
        "todaySeconds": today,
        "last7dSeconds": d7,
        "last30dSeconds": d30,
        "sessions": sessions,
        "events": events,
        "topScenesByPlays": top,
    }))
}
