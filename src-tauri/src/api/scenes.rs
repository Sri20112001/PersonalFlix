use crate::api::{jcol, json_val_to_sqlite};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::{params, types::Value, Connection};
use serde_json::{json, Value as JValue};
use std::collections::{HashMap, HashSet};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/random", get(random))
        .route("/missing", get(missing))
        .route("/", get(list).post(create))
        .route("/{id}/similar", get(similar))
        .route("/{id}", get(one).patch(update).delete(remove))
}

pub const SCENE_COLS: &str = "id, file_name, original_name, resolution, studio, studio_id, title, performers, performer_ids, date, network, source_url, file_path, category_ids, related_ids, file_exists, size_bytes, mtime, tags, description";

/// Link-resolution failure: the caller supplied an id with no canonical row.
/// Handlers map this to 400 — relationships are never stored unvalidated
/// (MAPPING_INVARIANTS.md §2.1, Phase 3 review queue writes through here).
#[derive(Debug, PartialEq)]
pub(crate) enum LinkError {
    UnknownPerformer(String),
    UnknownStudio(String),
}

/// Resolve performer ids to display names in order. Err on the first unknown.
pub(crate) fn resolve_performer_names(
    conn: &Connection,
    ids: &[String],
) -> Result<Vec<String>, LinkError> {
    let mut names = Vec::with_capacity(ids.len());
    for pid in ids {
        let name: Option<String> = conn
            .query_row("SELECT name FROM performers WHERE id = ?1", params![pid], |r| r.get(0))
            .ok()
            .flatten();
        match name {
            Some(n) => names.push(n),
            None => return Err(LinkError::UnknownPerformer(pid.clone())),
        }
    }
    Ok(names)
}

/// Resolve a studio id to its canonical display name. Err when unknown.
pub(crate) fn resolve_studio_name(conn: &Connection, sid: &str) -> Result<String, LinkError> {
    conn.query_row("SELECT name FROM studios WHERE id = ?1", params![sid], |r| {
        r.get::<_, String>(0)
    })
    .map_err(|_| LinkError::UnknownStudio(sid.to_string()))
}

pub fn scene_from_row(row: &rusqlite::Row) -> rusqlite::Result<JValue> {
    Ok(json!({
        "_id": row.get::<_, i64>(0)?,
        "file_name": row.get::<_, Option<String>>(1)?,
        "original_name": row.get::<_, Option<String>>(2)?,
        "resolution": row.get::<_, Option<String>>(3)?,
        "studio": row.get::<_, Option<String>>(4)?,
        "studio_id": row.get::<_, Option<String>>(5)?,
        "title": row.get::<_, Option<String>>(6)?,
        "performers": jcol(row.get::<_, Option<String>>(7)?),
        "performer_ids": jcol(row.get::<_, Option<String>>(8)?),
        "date": row.get::<_, Option<String>>(9)?,
        "network": row.get::<_, Option<String>>(10)?,
        "source_url": row.get::<_, Option<String>>(11)?,
        "file_path": row.get::<_, Option<String>>(12)?,
        "category_ids": jcol(row.get::<_, Option<String>>(13)?),
        "related_ids": jcol(row.get::<_, Option<String>>(14)?),
        "file_exists": row.get::<_, Option<i64>>(15)?.unwrap_or(1),
        "size_bytes": row.get::<_, Option<i64>>(16)?.unwrap_or(0),
        "mtime": row.get::<_, Option<f64>>(17)?.unwrap_or(0.0),
        "tags": jcol(row.get::<_, Option<String>>(18)?),
        "description": row.get::<_, Option<String>>(19)?.unwrap_or_default(),
    }))
}

fn build_filter(query: &HashMap<String, String>) -> (String, Vec<Value>) {
    let mut where_clauses: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(st) = query.get("studio") {
        where_clauses.push("studio_id = ?".into());
        params.push(st.clone().into());
    }
    if let Some(p) = query.get("performer") {
        where_clauses.push(
            "EXISTS (SELECT 1 FROM json_each(scenes.performer_ids) WHERE json_each.value = ?)"
                .into(),
        );
        params.push(p.clone().into());
    }
    if let Some(c) = query.get("category") {
        where_clauses.push(
            "EXISTS (SELECT 1 FROM json_each(scenes.category_ids) WHERE json_each.value = ?)"
                .into(),
        );
        params.push(c.clone().into());
    }
    if let Some(t) = query.get("tag") {
        where_clauses.push(
            "EXISTS (SELECT 1 FROM json_each(scenes.tags) WHERE json_each.value LIKE ? COLLATE NOCASE)"
                .into(),
        );
        params.push(format!("%{}%", t).into());
    }
    if let Some(se) = query.get("search") {
        where_clauses.push("title LIKE ? COLLATE NOCASE".into());
        params.push(format!("%{}%", se).into());
    }
    if let Some(f) = query.get("file") {
        where_clauses.push("(file_name = ? OR original_name = ?)".into());
        params.push(f.clone().into());
        params.push(f.clone().into());
    }
    if let Some(st) = query.get("status") {
        if st == "unwatched" {
            where_clauses.push("NOT EXISTS (SELECT 1 FROM tracking t WHERE t.scene_id = scenes.id)".into());
        } else {
            where_clauses.push(
                "EXISTS (SELECT 1 FROM tracking t WHERE t.scene_id = scenes.id AND t.status = ?)"
                    .into(),
            );
            params.push(st.clone().into());
        }
    }
    if let Some(res) = query.get("resolution") {
        where_clauses.push("resolution LIKE ? COLLATE NOCASE".into());
        params.push(format!("%{}%", res).into());
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };
    (where_sql, params)
}

fn fetch_scenes(conn: &Connection, where_sql: &str, params: &[Value], limit: i64, offset: i64, order: &str) -> Vec<JValue> {
    let mut full: Vec<Value> = params.to_vec();
    full.push(limit.into());
    full.push(offset.into());
    let sql = format!(
        "SELECT {} FROM scenes{} ORDER BY {} LIMIT ? OFFSET ?",
        SCENE_COLS, where_sql, order
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let rows = stmt
        .query_map(rusqlite::params_from_iter(full.iter()), scene_from_row)
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let page = query.get("page").and_then(|p| p.parse::<i64>().ok()).unwrap_or(1).max(1);
    let limit = query
        .get("limit")
        .and_then(|l| l.parse::<i64>().ok())
        .unwrap_or(50)
        .clamp(1, 200);
    let (where_sql, params) = build_filter(&query);

    let total: i64 = {
        let sql = format!("SELECT COUNT(*) FROM scenes{}", where_sql);
        conn.query_row(&sql, rusqlite::params_from_iter(params.iter()), |r| r.get(0))
            .unwrap_or(0)
    };
    let sort_param = query.get("sort").map(|s| s.as_str()).unwrap_or("recent");
    let order = match sort_param {
        "mtime" => "mtime DESC, id DESC",
        "title_asc" | "title" => "LOWER(COALESCE(NULLIF(title, ''), file_name)) ASC, id DESC",
        "title_desc" => "LOWER(COALESCE(NULLIF(title, ''), file_name)) DESC, id DESC",
        "date_desc" | "date" => "CASE WHEN date IS NOT NULL AND date != '' THEN date ELSE '0000-00-00' END DESC, id DESC",
        "date_asc" => "CASE WHEN date IS NOT NULL AND date != '' THEN date ELSE '9999-99-99' END ASC, id ASC",
        "size_desc" | "size" => "size_bytes DESC, id DESC",
        "random" => "RANDOM()",
        _ => "id DESC",
    };
    let scenes = fetch_scenes(&conn, &where_sql, &params, limit, (page - 1) * limit, order);
    let total_pages = if limit > 0 { (total as f64 / limit as f64).ceil() as i64 } else { 0 };
    Json(json!({ "scenes": scenes, "total": total, "page": page, "totalPages": total_pages }))
}

async fn random(State(state): State<AppState>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let sql = format!(
        "SELECT {} FROM scenes WHERE id NOT IN (SELECT scene_id FROM tracking) ORDER BY RANDOM() LIMIT 1",
        SCENE_COLS
    );
    let row = conn
        .query_row(&sql, [], scene_from_row)
        .or_else(|_| {
            let sql2 = format!("SELECT {} FROM scenes ORDER BY RANDOM() LIMIT 1", SCENE_COLS);
            conn.query_row(&sql2, [], scene_from_row)
        });
    match row {
        Ok(v) => Ok(Json(v)),
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

async fn missing(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let page = query.get("page").and_then(|p| p.parse::<i64>().ok()).unwrap_or(1).max(1);
    let limit = query
        .get("limit")
        .and_then(|l| l.parse::<i64>().ok())
        .unwrap_or(50)
        .clamp(1, 200);

    let m_type = query.get("type").map(|t| t.as_str()).unwrap_or("performers");
    if m_type == "thumbnail" {
        let mut stmt = conn.prepare("SELECT id FROM scenes ORDER BY id DESC").unwrap();
        let all_ids: Vec<i64> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        let missing_ids: Vec<i64> = all_ids
            .into_iter()
            .filter(|id| {
                let p1 = state.thumbnails_path.join(format!("{}.jpg", id));
                let p2 = state.thumbnails_path.join(format!("{}.jpeg", id));
                !p1.exists() && !p2.exists()
            })
            .collect();
        let total = missing_ids.len() as i64;
        let start = ((page - 1) * limit) as usize;
        let paged_ids: Vec<i64> = missing_ids
            .into_iter()
            .skip(start)
            .take(limit as usize)
            .collect();
        let scenes = if paged_ids.is_empty() {
            vec![]
        } else {
            let ph = vec!["?"; paged_ids.len()].join(",");
            let mut stmt = conn
                .prepare(&format!("SELECT {} FROM scenes WHERE id IN ({})", SCENE_COLS, ph))
                .unwrap();
            let fetched: Vec<JValue> = stmt
                .query_map(rusqlite::params_from_iter(paged_ids.iter()), scene_from_row)
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();
            let mut map: HashMap<i64, JValue> = HashMap::new();
            for s in fetched {
                if let Some(id) = s["_id"].as_i64() {
                    map.insert(id, s);
                }
            }
            paged_ids.iter().filter_map(|id| map.remove(id)).collect()
        };
        return Json(json!({
            "scenes": scenes,
            "total": total,
            "page": page,
            "totalPages": ((total as f64 / limit as f64).ceil() as i64),
            "allPerformers": []
        }));
    }

    let mut cond = String::new();
    let params: Vec<Value> = Vec::new();
    if m_type == "performers" {
        cond = " WHERE (json_array_length(performers) = 0 OR performers IS NULL) OR (json_array_length(performer_ids) = 0 OR performer_ids IS NULL)".to_string();
    }

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM scenes{}", cond),
            rusqlite::params_from_iter(params.iter()),
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut full = params.clone();
    full.push(limit.into());
    full.push(((page - 1) * limit).into());
    let sql = format!(
        "SELECT {} FROM scenes{} ORDER BY id DESC LIMIT ? OFFSET ?",
        SCENE_COLS, cond
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let scenes: Vec<JValue> = stmt
        .query_map(rusqlite::params_from_iter(full.iter()), scene_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn.prepare("SELECT id, name FROM performers ORDER BY name COLLATE NOCASE ASC").unwrap();
    let all_performers: Vec<JValue> = stmt
        .query_map([], |r| {
            Ok(json!({ "_id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)? }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    Json(json!({
        "scenes": scenes,
        "total": total,
        "page": page,
        "totalPages": ((total as f64 / limit as f64).ceil() as i64),
        "allPerformers": all_performers
    }))
}

async fn create(
    State(state): State<AppState>,
    Json(body): Json<JValue>,
) -> Result<(StatusCode, Json<JValue>), StatusCode> {
    let conn = state.db.lock().unwrap();
    let id = body["_id"].as_i64().unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    });
    let ok = conn
        .execute(
            "INSERT OR REPLACE INTO scenes
             (id, file_name, original_name, resolution, studio, studio_id, title, performers, performer_ids, date, network, source_url, file_path, category_ids, related_ids)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                id,
                body["file_name"].as_str(),
                body["original_name"].as_str(),
                body["resolution"].as_str(),
                body["studio"].as_str(),
                body["studio_id"].as_str(),
                body["title"].as_str(),
                body["performers"].to_string(),
                body["performer_ids"].to_string(),
                body["date"].as_str(),
                body["network"].as_str(),
                body["source_url"].as_str(),
                body["file_path"].as_str(),
                body["category_ids"].to_string(),
                body["related_ids"].to_string()
            ],
        )
        .is_ok();
    if !ok {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let scene = conn
        .query_row(
            &format!("SELECT {} FROM scenes WHERE id = ?1", SCENE_COLS),
            params![id],
            scene_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::CREATED, Json(scene)))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<JValue>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    // Scalar fields written verbatim (relationship fields handled below so
    // denormalized name columns stay consistent with the id columns).
    let allowed: [&str; 13] = [
        "title", "category_ids", "date", "resolution", "file_name", "file_path",
        "related_ids", "network", "source_url", "original_name", "performers", "tags",
        "description",
    ];
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();
    for k in allowed.iter() {
        if *k == "performers" {
            continue;
        }
        if let Some(v) = body.get(*k) {
            sets.push(format!("{} = ?", k));
            params.push(json_val_to_sqlite(v));
        }
    }
    // Studio: resolve the display name from studio_id so `studio` never
    // goes stale. Fail CLOSED on unknown ids. Empty/missing studio_id
    // clears both columns.
    if let Some(sid) = body.get("studio_id") {
        if let Some(s) = sid.as_str().filter(|s| !s.is_empty()) {
            let name = match resolve_studio_name(&conn, s) {
                Ok(n) => n,
                Err(_) => return Err(StatusCode::BAD_REQUEST),
            };
            sets.push("studio_id = ?".into());
            params.push(s.to_string().into());
            sets.push("studio = ?".into());
            params.push(name.into());
        } else {
            sets.push("studio_id = ?".into());
            params.push(Value::Null);
            sets.push("studio = ?".into());
            params.push(Value::Null);
        }
    } else if let Some(v) = body.get("studio") {
        sets.push("studio = ?".into());
        params.push(json_val_to_sqlite(v));
    }
    // Performers: accept an array of performer ids (numbers or strings).
    // Fail CLOSED on unknown ids — never store an invalid ref with the raw
    // id as its display name (MAPPING_INVARIANTS.md §2.1). Display names are
    // rebuilt from the canonical performers table, in order.
    if let Some(arr) = body.get("performer_ids").and_then(|v| v.as_array()) {
        let ids: Vec<String> = arr
            .iter()
            .filter_map(|v| {
                v.as_str()
                    .map(String::from)
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            })
            .collect();
        let names = match resolve_performer_names(&conn, &ids) {
            Ok(n) => n,
            Err(_) => return Err(StatusCode::BAD_REQUEST),
        };
        sets.push("performer_ids = ?".into());
        params.push(serde_json::to_string(&ids).unwrap_or_else(|_| "[]".into()).into());
        sets.push("performers = ?".into());
        params.push(serde_json::to_string(&names).unwrap_or_else(|_| "[]".into()).into());
    } else if let Some(v) = body.get("performers") {
        sets.push("performers = ?".into());
        params.push(json_val_to_sqlite(v));
    }
    if sets.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    params.push(id.into());
    let sql = format!("UPDATE scenes SET {} WHERE id = ?", sets.join(", "));
    let n = conn
        .execute(&sql, rusqlite::params_from_iter(params.iter()))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if n == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    let scene = conn
        .query_row(
            &format!("SELECT {} FROM scenes WHERE id = ?1", SCENE_COLS),
            params![id],
            scene_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(scene))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seed::open_memory;

    /// Phase-3 save path: unknown ids are rejected (fail-closed), known ids
    /// resolve to canonical display names in order. The handler maps Err→400.
    #[test]
    fn link_resolution_rejects_unknown_ids() {
        let db = open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO performers(id,name) VALUES('a-rae','A Rae'),('b-fox','B Fox')",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('tushy','TUSHY')", []).unwrap();
        }
        let conn = db.lock().unwrap();
        assert_eq!(
            resolve_performer_names(&conn, &["a-rae".into(), "b-fox".into()]),
            Ok(vec!["A Rae".into(), "B Fox".into()])
        );
        assert_eq!(
            resolve_performer_names(&conn, &["a-rae".into(), "ghost".into()]),
            Err(LinkError::UnknownPerformer("ghost".into()))
        );
        assert_eq!(
            resolve_studio_name(&conn, "tushy"),
            Ok("TUSHY".to_string())
        );
        assert_eq!(
            resolve_studio_name(&conn, "nope"),
            Err(LinkError::UnknownStudio("nope".into()))
        );
    }

    #[test]
    fn compute_similar_ranks_and_excludes_missing_files() {
        let db = open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO performers(id,name) VALUES('p1','Performer One'),('p2','Performer Two')",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('s1','Studio One'),('s2','Studio Two')", []).unwrap();
            conn.execute("INSERT INTO categories(id,name) VALUES('c1','Category One'),('c2','Category Two')", []).unwrap();

            conn.execute(
                "INSERT INTO scenes(id, file_name, performer_ids, studio_id, studio, category_ids, file_exists) VALUES(100, 't100.mp4', '[\"p1\"]', 's1', 'Studio One', '[\"c1\"]', 1)",
                [],
            )
            .unwrap();

            conn.execute(
                "INSERT INTO scenes(id, file_name, performer_ids, studio_id, studio, category_ids, file_exists) VALUES(101, 'c101.mp4', '[\"p1\"]', 's1', 'Studio One', '[]', 1)",
                [],
            )
            .unwrap();

            conn.execute(
                "INSERT INTO scenes(id, file_name, performer_ids, studio_id, studio, category_ids, file_exists) VALUES(102, 'c102.mp4', '[]', 's2', 'Studio Two', '[\"c1\"]', 1)",
                [],
            )
            .unwrap();

            conn.execute(
                "INSERT INTO scenes(id, file_name, performer_ids, studio_id, studio, category_ids, file_exists) VALUES(103, 'c103.mp4', '[\"p1\"]', 's1', 'Studio One', '[]', 0)",
                [],
            )
            .unwrap();
        }

        let conn = db.lock().unwrap();
        let res = compute_similar(&conn, 100, 5).unwrap();
        let scenes = res["scenes"].as_array().unwrap();
        let ids: Vec<i64> = scenes.iter().map(|s| s["_id"].as_i64().unwrap()).collect();

        assert_eq!(ids, vec![101, 102]);
        assert!(!ids.contains(&103));

        let sim = res["similar"].as_array().unwrap();
        assert_eq!(sim.len(), 2);
        assert!(sim[0]["score"].as_f64().unwrap() > sim[1]["score"].as_f64().unwrap());
        assert!(sim[0]["match_percentage"].as_i64().unwrap() >= sim[1]["match_percentage"].as_i64().unwrap());
    }
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let scene = conn
        .query_row(
            &format!("SELECT {} FROM scenes WHERE id = ?1", SCENE_COLS),
            params![id],
            scene_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    conn.execute("DELETE FROM scenes WHERE id = ?1", params![id]).ok();
    conn.execute("DELETE FROM comments WHERE scene_id = ?1", params![id]).ok();
    conn.execute("DELETE FROM timestamps WHERE scene_id = ?1", params![id]).ok();
    conn.execute("DELETE FROM tracking WHERE scene_id = ?1", params![id]).ok();
    conn.execute(
        "DELETE FROM favorites WHERE type = 'scene' AND (target_id = ?1 OR target_id = ?2)",
        params![id, id.to_string()],
    )
    .ok();

    if let Ok(mut stmt) = conn.prepare("SELECT id, scene_ids FROM playlists") {
        let pls: Vec<(i64, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .ok()
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();
        for (pl_id, scene_ids_str) in pls {
            if let Ok(mut ids) = serde_json::from_str::<Vec<JValue>>(&scene_ids_str) {
                let initial_len = ids.len();
                ids.retain(|v| {
                    let vid = v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()));
                    vid != Some(id)
                });
                if ids.len() != initial_len {
                    let s = serde_json::to_string(&ids).unwrap_or_else(|_| "[]".into());
                    let _ = conn.execute(
                        "UPDATE playlists SET scene_ids = ?1 WHERE id = ?2",
                        params![s, pl_id],
                    );
                }
            }
        }
    }

    Ok(Json(json!({ "message": "Scene deleted", "scene": scene })))
}

async fn one(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let scene = conn
        .query_row(
            &format!("SELECT {} FROM scenes WHERE id = ?1", SCENE_COLS),
            params![id],
            scene_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let performer_ids: Vec<String> = scene["performer_ids"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| {
                    v.as_str()
                        .map(String::from)
                        .or_else(|| v.as_i64().map(|n| n.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();
    let category_ids: Vec<String> = scene["category_ids"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let studio_id: Option<String> = scene["studio_id"].as_str().map(String::from);

    let performers = if performer_ids.is_empty() {
        vec![]
    } else {
        let ph = vec!["?"; performer_ids.len()].join(",");
        let mut stmt = conn
            .prepare(&format!("SELECT id, name FROM performers WHERE id IN ({})", ph))
            .unwrap();
        let v: Vec<String> = performer_ids.clone();
        stmt.query_map(rusqlite::params_from_iter(v.iter()), |r| {
            Ok(json!({ "_id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)? }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    };

    let categories = if category_ids.is_empty() {
        vec![]
    } else {
        let ph = vec!["?"; category_ids.len()].join(",");
        let mut stmt = conn
            .prepare(&format!("SELECT id, name FROM categories WHERE id IN ({})", ph))
            .unwrap();
        let v: Vec<String> = category_ids.clone();
        stmt.query_map(rusqlite::params_from_iter(v.iter()), |r| {
            Ok(json!({ "_id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)? }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    };

    let studio = match studio_id {
        Some(sid) => conn
            .query_row("SELECT id, name FROM studios WHERE id = ?1", params![sid], |r| {
                Ok(json!({ "_id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)? }))
            })
            .ok(),
        None => None,
    };

    let comments: Vec<JValue> = {
        let mut stmt = conn
            .prepare("SELECT id, scene_id, text, created_at FROM comments WHERE scene_id = ?1 ORDER BY created_at DESC")
            .unwrap();
        stmt.query_map(params![id], |r| {
            Ok(json!({
                "_id": r.get::<_, i64>(0)?,
                "scene_id": r.get::<_, i64>(1)?,
                "text": r.get::<_, String>(2)?,
                "created_at": r.get::<_, String>(3)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    };

    let timestamps: Vec<JValue> = {
        let mut stmt = conn
            .prepare("SELECT id, scene_id, seconds, label, note, end_seconds, category, created_at FROM timestamps WHERE scene_id = ?1 ORDER BY seconds ASC")
            .unwrap();
        stmt.query_map(params![id], |r| {
            Ok(json!({
                "_id": r.get::<_, i64>(0)?,
                "scene_id": r.get::<_, i64>(1)?,
                "seconds": r.get::<_, f64>(2)?,
                "label": r.get::<_, String>(3)?,
                "note": r.get::<_, Option<String>>(4)?,
                "end_seconds": r.get::<_, Option<f64>>(5)?,
                "category": r.get::<_, Option<String>>(6)?,
                "created_at": r.get::<_, String>(7)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    };

    let tracking: Option<JValue> = conn
        .query_row(
            "SELECT scene_id, status, rating, notes, currentTime, updated_at FROM tracking WHERE scene_id = ?1",
            params![id],
            |r| {
                Ok(json!({
                    "scene_id": r.get::<_, i64>(0)?,
                    "status": r.get::<_, String>(1)?,
                    "rating": r.get::<_, Option<i64>>(2)?,
                    "notes": r.get::<_, Option<String>>(3)?,
                    "currentTime": r.get::<_, f64>(4)?,
                    "updated_at": r.get::<_, String>(5)?,
                }))
            },
        )
        .ok();

    Ok(Json(json!({
        "scene": scene,
        "performers": performers,
        "categories": categories,
        "studio": studio,
        "comments": comments,
        "timestamps": timestamps,
        "tracking": tracking,
    })))
}

async fn similar(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let limit = query
        .get("limit")
        .and_then(|l| l.parse::<usize>().ok())
        .unwrap_or(6)
        .clamp(1, 30);
    let res = compute_similar(&conn, id, limit)?;
    Ok(Json(res))
}

pub(crate) fn compute_similar(conn: &Connection, id: i64, limit: usize) -> Result<JValue, StatusCode> {
    let target = conn
        .query_row(
            &format!("SELECT {} FROM scenes WHERE id = ?1", SCENE_COLS),
            params![id],
            scene_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let target_pids: HashSet<String> = target["performer_ids"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())))
                .collect()
        })
        .unwrap_or_default();

    let target_cids: HashSet<String> = target["category_ids"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let target_related: HashSet<String> = target["related_ids"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())))
                .collect()
        })
        .unwrap_or_default();

    let target_studio_id = target["studio_id"].as_str().map(String::from);
    let target_studio_name = target["studio"].as_str().map(String::from);
    let target_resolution = target["resolution"].as_str().map(String::from);

    let mut performer_names: HashMap<String, String> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name FROM performers") {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
            for row in rows.flatten() {
                performer_names.insert(row.0, row.1);
            }
        }
    }

    let mut category_names: HashMap<String, String> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name FROM categories") {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
            for row in rows.flatten() {
                category_names.insert(row.0, row.1);
            }
        }
    }

    let mut fav_performers: HashSet<String> = HashSet::new();
    if let Ok(mut stmt) = conn.prepare("SELECT target_id FROM favorites WHERE type = 'performer'") {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            for row in rows.flatten() {
                fav_performers.insert(row);
            }
        }
    }

    let mut tracking_status: HashMap<i64, String> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT scene_id, status FROM tracking") {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))) {
            for (sid, st) in rows.flatten() {
                tracking_status.insert(sid, st);
            }
        }
    }

    let sql = format!(
        "SELECT {} FROM scenes WHERE id != ?1 AND file_exists = 1",
        SCENE_COLS
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let candidates: Vec<JValue> = stmt
        .query_map(params![id], scene_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    struct ScoredScene {
        scene: JValue,
        score: f64,
        match_percentage: i64,
        reasons: Vec<String>,
        performer_matches: Vec<String>,
    }

    let mut scored: Vec<ScoredScene> = candidates
        .into_iter()
        .map(|c| {
            let cid = c["_id"].as_i64().unwrap_or(0);
            let cid_str = cid.to_string();

            let cpids: HashSet<String> = c["performer_ids"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            let ccids: HashSet<String> = c["category_ids"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let crelated: HashSet<String> = c["related_ids"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            let mut score = 0.0;
            let mut reasons: Vec<String> = Vec::new();
            let mut performer_matches: Vec<String> = Vec::new();

            if target_related.contains(&cid_str) || crelated.contains(&id.to_string()) {
                score += 50.0;
                reasons.push("Series / Sequel".to_string());
            }

            for pid in &target_pids {
                if cpids.contains(pid) {
                    score += 10.0;
                    let pname = performer_names.get(pid).cloned().unwrap_or_else(|| pid.clone());
                    if fav_performers.contains(pid) {
                        score += 5.0;
                        performer_matches.push(format!("★ {}", pname));
                    } else {
                        performer_matches.push(pname);
                    }
                }
            }
            if !performer_matches.is_empty() {
                if performer_matches.len() == 1 {
                    reasons.push(format!("Performer: {}", performer_matches[0]));
                } else {
                    reasons.push(format!("Performers: {}", performer_matches.join(", ")));
                }
            }

            if let (Some(ts), Some(cs)) = (&target_studio_id, c["studio_id"].as_str()) {
                if !ts.is_empty() && ts == cs {
                    score += 4.0;
                    let sname = target_studio_name.as_deref().unwrap_or(ts);
                    reasons.push(format!("Studio: {}", sname));
                }
            }

            let intersect_count = target_cids.intersection(&ccids).count();
            if intersect_count > 0 {
                let union_count = target_cids.union(&ccids).count();
                let jaccard = (intersect_count as f64) / (union_count as f64).max(1.0);
                let cat_score = jaccard * 12.0;
                score += cat_score;

                let matching_cat_names: Vec<String> = target_cids
                    .intersection(&ccids)
                    .take(2)
                    .filter_map(|cid| category_names.get(cid).cloned())
                    .collect();
                if !matching_cat_names.is_empty() {
                    reasons.push(format!("Genre: {}", matching_cat_names.join(", ")));
                }
            }

            if let (Some(tr), Some(cr)) = (&target_resolution, c["resolution"].as_str()) {
                if !tr.is_empty() && tr == cr {
                    score += 1.0;
                }
            }

            if let Some(status) = tracking_status.get(&cid) {
                match status.as_str() {
                    "watched" => score -= 3.0,
                    "want" => {
                        score += 3.0;
                        reasons.push("In Watchlist".to_string());
                    }
                    _ => {}
                }
            } else {
                score += 1.0;
            }

            let pct = if score >= 35.0 {
                95 + ((score - 35.0) / 5.0).min(4.0) as i64
            } else if score >= 20.0 {
                85 + ((score - 20.0) / 15.0 * 9.0) as i64
            } else if score >= 10.0 {
                70 + ((score - 10.0) / 10.0 * 14.0) as i64
            } else if score > 0.0 {
                50 + (score / 10.0 * 19.0) as i64
            } else {
                40
            };

            ScoredScene {
                scene: c,
                score,
                match_percentage: pct.clamp(40, 99),
                reasons,
                performer_matches,
            }
        })
        .collect();

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                let a_id = a.scene["_id"].as_i64().unwrap_or(0);
                let b_id = b.scene["_id"].as_i64().unwrap_or(0);
                b_id.cmp(&a_id)
            })
    });

    let top_scored = scored.into_iter().take(limit).collect::<Vec<_>>();

    let scenes_list: Vec<JValue> = top_scored.iter().map(|s| s.scene.clone()).collect();
    let similar_list: Vec<JValue> = top_scored
        .into_iter()
        .map(|s| {
            json!({
                "scene": s.scene,
                "score": s.score,
                "match_percentage": s.match_percentage,
                "reasons": s.reasons,
                "performer_matches": s.performer_matches,
            })
        })
        .collect();

    Ok(json!({
        "scenes": scenes_list,
        "similar": similar_list,
        "total": scenes_list.len(),
    }))
}