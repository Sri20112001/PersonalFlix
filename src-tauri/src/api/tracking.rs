use crate::api::scenes::{scene_from_row, SCENE_COLS};
use crate::api::now_iso;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, put};
use axum::{Json, Router};
use rusqlite::{params, types::Value};
use serde_json::{json, Value as JValue};
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list))
        .route("/continue-watching", get(continue_watching))
        .route("/history", get(history))
        .route("/{sceneId}", put(upsert).delete(remove))
        .route("/{sceneId}/progress", put(progress))
}

fn tracking_from_row(row: &rusqlite::Row) -> rusqlite::Result<JValue> {
    Ok(json!({
        "_id": row.get::<_, i64>(0)?,
        "scene_id": row.get::<_, i64>(0)?,
        "status": row.get::<_, String>(1)?,
        "rating": row.get::<_, Option<i64>>(2)?,
        "notes": row.get::<_, Option<String>>(3)?,
        "currentTime": row.get::<_, f64>(4)?,
        "duration": row.get::<_, Option<f64>>(5)?,
        "updated_at": row.get::<_, String>(6)?,
    }))
}

fn fetch_scenes_by_ids(conn: &rusqlite::Connection, ids: &[i64]) -> HashMap<i64, JValue> {
    let mut map = HashMap::new();
    if ids.is_empty() {
        return map;
    }
    let ph = vec!["?"; ids.len()].join(",");
    let sql = format!("SELECT {} FROM scenes WHERE id IN ({})", SCENE_COLS, ph);
    let mut stmt = conn.prepare(&sql).unwrap();
    let rows = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), scene_from_row)
        .unwrap();
    for r in rows.flatten() {
        if let Some(id) = r["_id"].as_i64() {
            map.insert(id, r);
        }
    }
    map
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let mut cond = String::new();
    let mut params: Vec<Value> = Vec::new();
    if let Some(st) = query.get("status") {
        cond = " WHERE status = ?".to_string();
        params.push(st.clone().into());
    }
    let sql = format!(
        "SELECT scene_id, status, rating, notes, currentTime, duration, updated_at FROM tracking{} ORDER BY updated_at DESC",
        cond
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let rows: Vec<JValue> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), tracking_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    let ids: Vec<i64> = rows.iter().filter_map(|r| r["scene_id"].as_i64()).collect();
    let scene_map = fetch_scenes_by_ids(&conn, &ids);
    let out: Vec<JValue> = rows
        .into_iter()
        .map(|mut t| {
            let sid = t["scene_id"].as_i64();
            let scene = sid.and_then(|id| scene_map.get(&id).cloned());
            t["scene"] = scene.unwrap_or(JValue::Null);
            t
        })
        .collect();
    Json(JValue::Array(out))
}

async fn continue_watching(State(state): State<AppState>) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let sql = "SELECT scene_id, status, rating, notes, currentTime, duration, updated_at \
               FROM tracking \
               WHERE currentTime > 5 \
                 AND status != 'watched' \
                 AND status != 'skip' \
                 AND (duration IS NULL OR duration <= 0 OR currentTime < duration - 15) \
               ORDER BY updated_at DESC LIMIT 20";
    let mut stmt = conn.prepare(sql).unwrap();
    let rows: Vec<JValue> = stmt
        .query_map([], tracking_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    let ids: Vec<i64> = rows.iter().filter_map(|r| r["scene_id"].as_i64()).collect();
    let scene_map = fetch_scenes_by_ids(&conn, &ids);
    let out: Vec<JValue> = rows
        .into_iter()
        .map(|mut t| {
            let scene = t["scene_id"].as_i64().and_then(|id| scene_map.get(&id).cloned());
            t["scene"] = scene.unwrap_or(JValue::Null);
            t
        })
        .collect();
    Json(JValue::Array(out))
}

/// Watch history grouped by calendar day (UTC, from updated_at):
/// `[{ day, count, seconds, entries: [{...tracking, scene}] }]`, newest first.
/// `seconds` sums currentTime per entry as an approximation of time watched.
async fn history(State(state): State<AppState>) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT scene_id, status, rating, notes, currentTime, duration, updated_at FROM tracking ORDER BY updated_at DESC")
        .unwrap();
    let rows: Vec<JValue> = stmt
        .query_map([], tracking_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    let ids: Vec<i64> = rows.iter().filter_map(|r| r["scene_id"].as_i64()).collect();
    let scene_map = fetch_scenes_by_ids(&conn, &ids);
    let mut days: Vec<JValue> = Vec::new();
    let mut cur_day = String::new();
    for mut t in rows {
        let day = t["updated_at"].as_str().map(|s| s.get(..10).unwrap_or("").to_string()).unwrap_or_default();
        let scene = t["scene_id"].as_i64().and_then(|id| scene_map.get(&id).cloned());
        t["scene"] = scene.unwrap_or(JValue::Null);
        let secs = t["currentTime"].as_f64().unwrap_or(0.0).max(0.0);
        if day != cur_day {
            cur_day = day.clone();
            days.push(json!({ "day": day, "count": 0, "seconds": 0.0, "entries": [] }));
        }
        if let Some(d) = days.last_mut() {
            d["count"] = json!(d["count"].as_i64().unwrap_or(0) + 1);
            d["seconds"] = json!(d["seconds"].as_f64().unwrap_or(0.0) + secs);
            d["entries"].as_array_mut().unwrap().push(t);
        }
    }
    Json(json!({ "days": days }))
}

async fn upsert(
    State(state): State<AppState>,
    Path(scene_id): Path<i64>,
    Json(body): Json<JValue>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let status = body["status"].as_str().unwrap_or("want-to-watch").to_string();
    let rating = body["rating"].as_i64();
    let notes = body["notes"].as_str().map(String::from);
    let updated_at = now_iso();
    let current_time: f64 = conn
        .query_row(
            "SELECT currentTime FROM tracking WHERE scene_id = ?1",
            params![scene_id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    conn.execute(
        "INSERT INTO tracking (scene_id, status, rating, notes, currentTime, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(scene_id) DO UPDATE SET status=excluded.status, rating=excluded.rating, notes=excluded.notes, updated_at=excluded.updated_at",
        params![scene_id, status, rating, notes, current_time, updated_at],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let row = conn
        .query_row(
            "SELECT scene_id, status, rating, notes, currentTime, duration, updated_at FROM tracking WHERE scene_id = ?1",
            params![scene_id],
            tracking_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(row))
}

async fn progress(
    State(state): State<AppState>,
    Path(scene_id): Path<i64>,
    Json(body): Json<JValue>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let current_time = body["currentTime"].as_f64().unwrap_or(0.0);
    let duration = body["duration"].as_f64();
    let updated_at = now_iso();

    let computed_status = if let Some(st) = body["status"].as_str() {
        st.to_string()
    } else if let Some(dur) = duration {
        if dur > 0.0 && (current_time >= dur - 15.0 || (current_time / dur) >= 0.92) {
            "watched".to_string()
        } else if current_time > 5.0 {
            "watching".to_string()
        } else {
            "want-to-watch".to_string()
        }
    } else if current_time > 5.0 {
        "watching".to_string()
    } else {
        "want-to-watch".to_string()
    };

    conn.execute(
        "INSERT INTO tracking (scene_id, status, rating, notes, currentTime, duration, updated_at)
         VALUES (?1, ?2, NULL, NULL, ?3, ?4, ?5)
         ON CONFLICT(scene_id) DO UPDATE SET
            currentTime = excluded.currentTime,
            duration = COALESCE(excluded.duration, tracking.duration),
            status = CASE
                WHEN excluded.status = 'watched' THEN 'watched'
                WHEN tracking.status = 'watched' AND excluded.currentTime < 30.0 THEN excluded.status
                WHEN tracking.status = 'watched' THEN 'watched'
                ELSE excluded.status
            END,
            updated_at = excluded.updated_at",
        params![scene_id, computed_status, current_time, duration, updated_at],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let row = conn
        .query_row(
            "SELECT scene_id, status, rating, notes, currentTime, duration, updated_at FROM tracking WHERE scene_id = ?1",
            params![scene_id],
            tracking_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(row))
}

async fn remove(State(state): State<AppState>, Path(scene_id): Path<i64>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM tracking WHERE scene_id = ?1", params![scene_id])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "ok": true })))
}
