use crate::api::{jcol, json_val_to_sqlite};
use crate::api::scenes::scene_from_row;
use crate::api::scenes::SCENE_COLS;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::{params, types::Value, Connection};
use serde_json::{json, Value as JValue};
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{id}", get(one).patch(update).delete(remove))
}

fn performer_from_row(row: &rusqlite::Row) -> rusqlite::Result<JValue> {
    Ok(json!({
        "_id": row.get::<_, String>(0)?,
        "name": row.get::<_, Option<String>>(1)?,
        "slug": row.get::<_, Option<String>>(2)?,
        "source_url": row.get::<_, Option<String>>(3)?,
        "model_id": row.get::<_, Option<i64>>(4)?,
        "image_url": row.get::<_, Option<String>>(5)?,
        "views": row.get::<_, Option<String>>(6)?,
        "country": row.get::<_, Option<String>>(7)?,
        "gender": row.get::<_, Option<String>>(8)?,
        "attributes": jcol(row.get::<_, Option<String>>(9)?),
        "category_ids": jcol(row.get::<_, Option<String>>(10)?),
    }))
}

// Phase 2B: scene_ids removed from the table AND the payload. Zero app
// readers remained (Phase 1 + grep); counts come from scene_count instead.
const P_COLS: &str = "id, name, slug, source_url, model_id, image_url, views, country, gender, attributes, category_ids";

/// Forward-truth reverse lookup shared by detail, search, and tests:
/// scenes whose `performer_ids` contains this performer id (exact, TEXT).
/// This is the ONLY sanctioned performer→scenes resolution.
pub(crate) fn scenes_for_performer(conn: &Connection, performer_id: &str) -> Vec<i64> {
    conn.prepare(
        "SELECT id FROM scenes WHERE EXISTS \
           (SELECT 1 FROM json_each(CASE WHEN json_valid(scenes.performer_ids) \
             THEN scenes.performer_ids ELSE '[]' END) \
            WHERE CAST(value AS TEXT) = ?1) ORDER BY id DESC",
    )
    .map(|mut stmt| {
        stmt.query_map(params![performer_id], |r| r.get(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    })
    .unwrap_or_default()
}

/// Server-computed scene count for list responses. Same truth as above.
/// (The list handler inlines this as a correlated subquery to avoid N+1;
/// this fn is the tested reference implementation.)
#[allow(dead_code)]
pub(crate) fn scene_count_for_performer(conn: &Connection, performer_id: &str) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM scenes WHERE EXISTS \
           (SELECT 1 FROM json_each(CASE WHEN json_valid(scenes.performer_ids) \
             THEN scenes.performer_ids ELSE '[]' END) \
            WHERE CAST(value AS TEXT) = ?1)",
        params![performer_id],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

fn slugify(name: &str) -> String {
    name.to_lowercase().replace(|c: char| c.is_whitespace(), "-")
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let mut cond = String::new();
    let mut params: Vec<Value> = Vec::new();
    if let Some(se) = query.get("search") {
        cond.push_str(" WHERE name LIKE ? COLLATE NOCASE");
        params.push(format!("%{}%", se).into());
    }
    if let Some(g) = query.get("gender") {
        if cond.is_empty() {
            cond.push_str(" WHERE ");
        } else {
            cond.push_str(" AND ");
        }
        cond.push_str("gender = ?");
        params.push(g.clone().into());
    }
    // Phase 1 invariant: scene_count is derived from the forward direction
    // (scenes.performer_ids). performers.scene_ids is deprecated, never read.
    let sql = format!(
        "SELECT {}, (SELECT COUNT(*) FROM scenes WHERE EXISTS \
           (SELECT 1 FROM json_each(CASE WHEN json_valid(scenes.performer_ids) \
             THEN scenes.performer_ids ELSE '[]' END) \
            WHERE CAST(value AS TEXT) = performers.id)) AS scene_count \
         FROM performers{} ORDER BY name COLLATE NOCASE ASC",
        P_COLS, cond
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let performers: Vec<JValue> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |r| {
            let mut p = performer_from_row(r)?;
            p["scene_count"] = json!(r.get::<_, i64>(11).unwrap_or(0));
            Ok(p)
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(JValue::Array(performers))
}

async fn one(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let performer = conn
        .query_row(
            &format!("SELECT {} FROM performers WHERE id = ?1", P_COLS),
            params![id],
            performer_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;

    // Phase 2B: resolution via the shared forward-truth helper. No cache,
    // no name fallback.
    let scene_ids: Vec<i64> = scenes_for_performer(&conn, &id);

    let mut scenes: Vec<JValue> = if scene_ids.is_empty() {
        vec![]
    } else {
        let ph = vec!["?"; scene_ids.len()].join(",");
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {} FROM scenes WHERE id IN ({}) ORDER BY id DESC",
                SCENE_COLS, ph
            ))
            .unwrap();
        stmt.query_map(rusqlite::params_from_iter(scene_ids.iter()), scene_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    };

    // Fetch tracking for these scenes
    let mut tracking_map: HashMap<i64, (String, f64, f64)> = HashMap::new();
    if !scene_ids.is_empty() {
        let ph = vec!["?"; scene_ids.len()].join(",");
        if let Ok(mut stmt) = conn.prepare(&format!(
            "SELECT scene_id, status, currentTime, duration FROM tracking WHERE scene_id IN ({})",
            ph
        )) {
            let rows = stmt.query_map(rusqlite::params_from_iter(scene_ids.iter()), |r| {
                let sid: i64 = r.get(0)?;
                let status: String = r.get::<_, Option<String>>(1)?.unwrap_or_default();
                let ct: f64 = r.get::<_, Option<f64>>(2)?.unwrap_or(0.0);
                let dur: f64 = r.get::<_, Option<f64>>(3)?.unwrap_or(0.0);
                Ok((sid, status, ct, dur))
            });
            if let Ok(rows) = rows {
                for r in rows.filter_map(|x| x.ok()) {
                    tracking_map.insert(r.0, (r.1, r.2, r.3));
                }
            }
        }
    }

    // Attach tracking info to scenes and calculate stats
    let mut total_duration: f64 = 0.0;
    let mut watched_count: usize = 0;
    let mut watching_count: usize = 0;
    let mut res_counts: HashMap<String, usize> = HashMap::new();
    let mut studio_map: HashMap<String, (String, usize)> = HashMap::new(); // studio_id -> (name, count)
    let mut co_star_counts: HashMap<String, usize> = HashMap::new(); // performer_id -> count
    let mut all_cat_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    // From performer category_ids
    if let Some(cats) = performer["category_ids"].as_array() {
        for c in cats {
            if let Some(cs) = c.as_str() {
                all_cat_ids.insert(cs.to_string());
            }
        }
    }

    for sc in &mut scenes {
        let sid = sc["_id"].as_i64().unwrap_or(0);
        if let Some((status, ct, dur)) = tracking_map.get(&sid) {
            let progress = if *dur > 0.0 { (ct / dur).min(1.0) } else { 0.0 };
            sc["progress"] = json!(progress);
            sc["status"] = json!(status);
            sc["currentTime"] = json!(ct);
            if status == "watched" {
                watched_count += 1;
            } else if status == "watching" || *ct > 0.0 {
                watching_count += 1;
            }
        } else {
            sc["progress"] = json!(0.0);
            sc["status"] = json!("");
            sc["currentTime"] = json!(0.0);
        }

        // Duration
        if let Some(dur) = sc["duration"].as_f64() {
            total_duration += dur;
        }

        // Resolution
        if let Some(res) = sc["resolution"].as_str() {
            if !res.is_empty() {
                *res_counts.entry(res.to_lowercase()).or_insert(0) += 1;
            }
        }

        // Studio
        if let Some(s_id) = sc["studio_id"].as_str() {
            if !s_id.is_empty() {
                let s_name = sc["studio"].as_str().unwrap_or(s_id).to_string();
                let entry = studio_map.entry(s_id.to_string()).or_insert((s_name, 0));
                entry.1 += 1;
            }
        }

        // Co-stars (from performer_ids)
        if let Some(p_ids) = sc["performer_ids"].as_array() {
            for pid in p_ids {
                if let Some(p_str) = pid.as_str() {
                    if p_str != id {
                        *co_star_counts.entry(p_str.to_string()).or_insert(0) += 1;
                    }
                }
            }
        }

        // Scene category_ids
        if let Some(c_ids) = sc["category_ids"].as_array() {
            for cid in c_ids {
                if let Some(c_str) = cid.as_str() {
                    all_cat_ids.insert(c_str.to_string());
                }
            }
        }
    }

    let unwatched_count = scenes.len().saturating_sub(watched_count + watching_count);

    // Resolve Studios
    let mut studios: Vec<JValue> = studio_map
        .into_iter()
        .map(|(s_id, (name, count))| {
            json!({
                "_id": s_id,
                "name": name,
                "count": count
            })
        })
        .collect();
    studios.sort_by(|a, b| {
        let ca = a["count"].as_u64().unwrap_or(0);
        let cb = b["count"].as_u64().unwrap_or(0);
        cb.cmp(&ca)
    });

    // Resolve Top Co-Stars (up to 15)
    let mut sorted_co_stars: Vec<(String, usize)> = co_star_counts.into_iter().collect();
    sorted_co_stars.sort_by(|a, b| b.1.cmp(&a.1));
    sorted_co_stars.truncate(15);

    let mut co_stars: Vec<JValue> = Vec::new();
    if !sorted_co_stars.is_empty() {
        let star_ids: Vec<String> = sorted_co_stars.iter().map(|(cid, _)| cid.clone()).collect();
        let ph = vec!["?"; star_ids.len()].join(",");
        let sql = format!("SELECT id, name, image_url FROM performers WHERE id IN ({})", ph);
        if let Ok(mut stmt) = conn.prepare(&sql) {
            let star_rows: HashMap<String, (String, Option<String>)> = stmt
                .query_map(rusqlite::params_from_iter(star_ids.iter()), |r| {
                    Ok((r.get::<_, String>(0)?, (r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?)))
                })
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            for (cid, count) in sorted_co_stars {
                if let Some((name, img)) = star_rows.get(&cid) {
                    co_stars.push(json!({
                        "_id": cid,
                        "name": name,
                        "image_url": img,
                        "count": count
                    }));
                }
            }
        }
    }

    // Resolve Categories
    let mut categories: Vec<JValue> = Vec::new();
    if !all_cat_ids.is_empty() {
        let cat_ids_vec: Vec<String> = all_cat_ids.into_iter().collect();
        let ph = vec!["?"; cat_ids_vec.len()].join(",");
        let sql = format!("SELECT id, name FROM categories WHERE id IN ({}) ORDER BY name COLLATE NOCASE ASC", ph);
        if let Ok(mut stmt) = conn.prepare(&sql) {
            categories = stmt
                .query_map(rusqlite::params_from_iter(cat_ids_vec.iter()), |r| {
                    Ok(json!({
                        "_id": r.get::<_, String>(0)?,
                        "name": r.get::<_, String>(1)?
                    }))
                })
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();
        }
    }

    // Cross-video links: chapters + comments tagged with this performer
    // (performer_ids JSON array, same forward-truth pattern as scenes).
    let mut tagged_chapters: Vec<JValue> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.id, t.scene_id, t.seconds, t.label, t.end_seconds, t.category,
                COALESCE(s.title, s.file_name, ''), COALESCE(s.studio, '')
         FROM timestamps t JOIN scenes s ON s.id = t.scene_id
         WHERE EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(t.performer_ids)
            THEN t.performer_ids ELSE '[]' END) WHERE CAST(value AS TEXT) = ?1)
         ORDER BY s.id DESC, t.seconds ASC LIMIT 100",
    ) {
        if let Ok(rows) = stmt.query_map(params![id], |r| {
            Ok(json!({
                "_id": r.get::<_, i64>(0)?,
                "scene_id": r.get::<_, i64>(1)?,
                "seconds": r.get::<_, f64>(2)?,
                "label": r.get::<_, Option<String>>(3)?,
                "end_seconds": r.get::<_, Option<f64>>(4)?,
                "category": r.get::<_, Option<String>>(5)?,
                "scene_title": r.get::<_, String>(6)?,
                "scene_studio": r.get::<_, String>(7)?,
            }))
        }) {
            tagged_chapters = rows.filter_map(|r| r.ok()).collect();
        }
    }
    let mut tagged_comments: Vec<JValue> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT c.id, c.scene_id, c.text, c.created_at,
                COALESCE(s.title, s.file_name, '')
         FROM comments c JOIN scenes s ON s.id = c.scene_id
         WHERE EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(c.performer_ids)
            THEN c.performer_ids ELSE '[]' END) WHERE CAST(value AS TEXT) = ?1)
         ORDER BY c.created_at DESC LIMIT 50",
    ) {
        if let Ok(rows) = stmt.query_map(params![id], |r| {
            Ok(json!({
                "_id": r.get::<_, i64>(0)?,
                "scene_id": r.get::<_, i64>(1)?,
                "text": r.get::<_, String>(2)?,
                "created_at": r.get::<_, String>(3)?,
                "scene_title": r.get::<_, String>(4)?,
            }))
        }) {
            tagged_comments = rows.filter_map(|r| r.ok()).collect();
        }
    }

    let stats = json!({
        "scene_count": scenes.len(),
        "total_duration": total_duration,
        "watched_count": watched_count,
        "watching_count": watching_count,
        "unwatched_count": unwatched_count,
        "resolution_counts": res_counts,
        "tagged_chapter_count": tagged_chapters.len(),
        "tagged_comment_count": tagged_comments.len(),
    });

    Ok(Json(json!({
        "performer": performer,
        "scenes": scenes,
        "categories": categories,
        "studios": studios,
        "co_stars": co_stars,
        "stats": stats,
        "tagged_chapters": tagged_chapters,
        "tagged_comments": tagged_comments
    })))
}

async fn create(
    State(state): State<AppState>,
    Json(body): Json<JValue>,
) -> Result<(StatusCode, Json<JValue>), StatusCode> {
    let conn = state.db.lock().unwrap();
    let name = body["name"].as_str().unwrap_or("").to_string();
    if name.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let id = body["_id"].as_str().map(String::from)
        .or_else(|| body["slug"].as_str().map(String::from))
        .unwrap_or_else(|| slugify(&name));
    let gender = body["gender"].as_str().unwrap_or("female").to_string();
    let ok = conn
        .execute(
            "INSERT OR REPLACE INTO performers
             (id, name, slug, source_url, model_id, image_url, views, country, gender, attributes, category_ids)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                id,
                name,
                body["slug"].as_str().map(String::from).unwrap_or_else(|| id.clone()),
                body["source_url"].as_str(),
                body["model_id"].as_i64(),
                body["image_url"].as_str(),
                body["views"].as_str(),
                body["country"].as_str(),
                gender,
                body["attributes"].to_string(),
                body["category_ids"].to_string()
            ],
        )
        .is_ok();
    if !ok {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let performer = conn
        .query_row(
            &format!("SELECT {} FROM performers WHERE id = ?1", P_COLS),
            params![id],
            performer_from_row,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((StatusCode::CREATED, Json(performer)))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<JValue>,
) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    // NOTE (Phase 2B): no scene linkage here — relationships are edited
    // exclusively via scenes.performer_ids.
    let allowed: [&str; 9] = [
        "name", "slug", "source_url", "model_id", "image_url", "views", "country", "gender",
        "category_ids",
    ];
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Value> = Vec::new();
    for k in allowed.iter() {
        if let Some(v) = body.get(*k) {
            sets.push(format!("{} = ?", k));
            params.push(json_val_to_sqlite(v));
        }
    }
    if sets.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    params.push(id.clone().into());
    let sql = format!("UPDATE performers SET {} WHERE id = ?", sets.join(", "));
    let n = conn
        .execute(&sql, rusqlite::params_from_iter(params.iter()))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if n == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    let performer = conn
        .query_row(
            &format!("SELECT {} FROM performers WHERE id = ?1", P_COLS),
            params![id],
            performer_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(performer))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seed::open_memory;

    fn cols(db: &crate::db::Db, table: &str) -> Vec<String> {
        let conn = db.lock().unwrap();
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})")).unwrap();
        let names: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .flatten()
            .collect();
        drop(stmt);
        drop(conn);
        names
    }

    /// Phase 2B regression test: performer→scenes resolution comes
    /// EXCLUSIVELY from scenes.performer_ids. There is no reverse cache left
    /// to read (column gone), no name fallback, and counts agree with detail.
    #[test]
    fn performer_scenes_come_only_from_forward_truth() {
        let db = open_memory();
        assert!(
            !cols(&db, "performers").contains(&"scene_ids".to_string()),
            "performers.scene_ids must not exist"
        );
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO performers(id,name,slug) VALUES('adria-rae','Adria Rae','adria-rae')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO performers(id,name,slug) VALUES('nobody','Nobody','nobody')",
                [],
            )
            .unwrap();
            // INT element (not TEXT) must still match via CAST rule.
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids) VALUES(1,'A','[\"adria-rae\"]')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids) VALUES(2,'B','[777]')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids) VALUES(3,'C','[]')",
                [],
            )
            .unwrap();
        }
        let conn = db.lock().unwrap();
        // Detail path: exact id match only (no name fallback).
        assert_eq!(scenes_for_performer(&conn, "adria-rae"), vec![1]);
        assert_eq!(scenes_for_performer(&conn, "nobody"), Vec::<i64>::new());
        assert_eq!(scenes_for_performer(&conn, "Adria Rae"), Vec::<i64>::new());
        // Numeric element matches its TEXT form via the CAST rule
        // (MAPPING_INVARIANTS.md §2.3); the audit flags it as invalid ref.
        assert_eq!(scenes_for_performer(&conn, "777"), vec![2]);
        // List path: counts agree with detail.
        assert_eq!(scene_count_for_performer(&conn, "adria-rae"), 1);
        assert_eq!(scene_count_for_performer(&conn, "nobody"), 0);
        assert_eq!(scene_count_for_performer(&conn, "777"), 1);
    }
}

async fn remove(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<JValue>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let performer = conn
        .query_row(
            &format!("SELECT {} FROM performers WHERE id = ?1", P_COLS),
            params![id],
            performer_from_row,
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;
    conn.execute("DELETE FROM performers WHERE id = ?1", params![id]).ok();
    Ok(Json(json!({ "message": "Performer deleted", "performer": performer })))
}