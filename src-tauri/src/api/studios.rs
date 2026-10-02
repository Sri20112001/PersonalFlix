use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::{params, Connection};
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list))
        .route("/{id}", get(one).patch(update))
        .route("/{id}/detail", get(detail))
}

/// Signature categories for a studio (validated ids describing the house
/// style). Empty when the studio has no mapping yet.
pub(crate) fn studio_signature(conn: &Connection, studio_id: &str) -> Vec<String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT signature_categories FROM studios WHERE id = ?1",
            params![studio_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    let Some(raw) = raw else { return vec![] };
    let Ok(v) = serde_json::from_str::<Value>(&raw) else {
        return vec![];
    };
    // Keep only ids that still exist in categories (fail closed on renames).
    let valid: std::collections::HashSet<String> = conn
        .prepare("SELECT id FROM categories")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .filter(|id| valid.contains(id))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

/// Union a studio's signature categories into every scene carrying that
/// studio_id. Additive only: existing scene categories are never removed.
/// Returns the number of scenes touched.
pub(crate) fn propagate_studio_signatures(conn: &Connection, studio_id: &str) -> usize {
    let sig = studio_signature(conn, studio_id);
    if sig.is_empty() {
        return 0;
    }
    let mut stmt = match conn.prepare(
        "SELECT id, category_ids FROM scenes WHERE studio_id = ?1",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let rows: Vec<(i64, String)> = stmt
        .query_map(params![studio_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default()))
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default();
    drop(stmt);
    let mut touched = 0;
    for (id, raw) in rows {
        let mut ids: Vec<String> = serde_json::from_str::<Vec<Value>>(&raw)
            .ok()
            .map(|a| {
                a.into_iter()
                    .filter_map(|v| match v {
                        Value::String(s) => Some(s),
                        Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    })
                    .collect()
            })
            .unwrap_or_default();
        let before = ids.len();
        for s in &sig {
            if !ids.iter().any(|x| x == s) {
                ids.push(s.clone());
            }
        }
        if ids.len() == before {
            continue;
        }
        if conn
            .execute(
                "UPDATE scenes SET category_ids = ?1 WHERE id = ?2",
                params![serde_json::to_string(&ids).unwrap_or_else(|_| "[]".into()), id],
            )
            .is_ok()
        {
            touched += 1;
        }
    }
    touched
}

fn studio_row(conn: &Connection, id: &str) -> Option<Value> {
    let (sid, name, style, sig): (String, Option<String>, Option<String>, Option<String>) =
        conn.query_row(
            "SELECT id, name, style, signature_categories FROM studios WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .ok()?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM scenes WHERE studio_id = ?1", params![id], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    Some(json!({
        "_id": sid,
        "name": name,
        "logo": Value::Null,
        "style": style.unwrap_or_default(),
        "signature_categories": serde_json::from_str::<Value>(&sig.unwrap_or_default())
            .unwrap_or(Value::Array(vec![])),
        "scene_count": count,
    }))
}

async fn list(State(state): State<AppState>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, style, signature_categories FROM studios ORDER BY name COLLATE NOCASE ASC")
        .unwrap();
    let rows: Vec<(String, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);
    let studios: Vec<Value> = rows
        .into_iter()
        .map(|(id, name, style, sig)| {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM scenes WHERE studio_id = ?1",
                    params![id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            json!({
                "_id": id,
                "name": name,
                "logo": logo_url(&state, &id),
                "style": style.unwrap_or_default(),
                "signature_categories": serde_json::from_str::<Value>(&sig.unwrap_or_default())
                    .unwrap_or(Value::Array(vec![])),
                "scene_count": count,
            })
        })
        .collect();
    Json(Value::Array(studios))
}

async fn one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    studio_row(&conn, &id)
        .map(|mut v| {
            v["logo"] = logo_url(&state, &id);
            Json(v)
        })
        .ok_or(StatusCode::NOT_FOUND)
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    if conn
        .query_row("SELECT id FROM studios WHERE id = ?1", params![id], |r| {
            r.get::<_, String>(0)
        })
        .is_err()
    {
        return Err(StatusCode::NOT_FOUND);
    }
    if let Some(name) = body.get("name").and_then(|v| v.as_str()) {
        let name = name.trim();
        if name.is_empty() {
            return Err(StatusCode::BAD_REQUEST);
        }
        conn.execute("UPDATE studios SET name = ?1 WHERE id = ?2", params![name, id])
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(style) = body.get("style").and_then(|v| v.as_str()) {
        conn.execute("UPDATE studios SET style = ?1 WHERE id = ?2", params![style, id])
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    let mut propagated = 0;
    if let Some(arr) = body.get("signature_categories").and_then(|v| v.as_array()) {
        // Fail closed: every id must exist in categories.
        let valid: std::collections::HashSet<String> = conn
            .prepare("SELECT id FROM categories")
            .map(|mut s| {
                s.query_map([], |r| r.get::<_, String>(0))
                    .map(|rows| rows.flatten().collect())
                    .unwrap_or_default()
            })
            .unwrap_or_default();
        let mut clean: Vec<String> = vec![];
        for v in arr {
            match v.as_str() {
                Some(s) if valid.contains(s) && !clean.iter().any(|x| x == s) => {
                    clean.push(s.to_string())
                }
                _ => return Err(StatusCode::BAD_REQUEST),
            }
        }
        conn.execute(
            "UPDATE studios SET signature_categories = ?1 WHERE id = ?2",
            params![serde_json::to_string(&clean).unwrap(), id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        // The mapping changed: push it to every scene of this studio now.
        propagated = propagate_studio_signatures(&conn, &id);
    }
    let mut out = studio_row(&conn, &id).ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    out["logo"] = logo_url(&state, &id);
    out["propagated"] = json!(propagated);
    Ok(Json(out))
}

/// Full Studio page payload: details, performer roster (with per-studio
/// scene counts), favorited scenes of this studio (most recent first),
/// top categories and totals. One call powers the whole page.
async fn detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let conn = state.db.lock().unwrap();
    let mut studio = studio_row(&conn, &id).ok_or(StatusCode::NOT_FOUND)?;
    studio["logo"] = logo_url(&state, &id);

    // Scene ids + bytes for this studio.
    let scene_rows: Vec<(i64, i64)> = conn
        .prepare("SELECT id, COALESCE(size_bytes, 0) FROM scenes WHERE studio_id = ?1")
        .map(|mut s| {
            s.query_map(params![id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let scene_ids: Vec<i64> = scene_rows.iter().map(|(sid, _)| *sid).collect();
    let bytes: i64 = scene_rows.iter().map(|(_, b)| b).sum();

    // Performer roster from forward truth (scenes.performer_ids).
    let mut counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut cat_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    if !scene_ids.is_empty() {
        let ph = vec!["?"; scene_ids.len()].join(",");
        let sql = format!(
            "SELECT performer_ids, category_ids FROM scenes WHERE id IN ({ph})"
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            let p = rusqlite::params_from_iter(scene_ids.iter());
            if let Ok(rows) = stmt.query_map(p, |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                ))
            }) {
                for row in rows.flatten() {
                    if let Ok(v) = serde_json::from_str::<Value>(&row.0) {
                        if let Some(a) = v.as_array() {
                            for pid in a.iter().filter_map(|x| x.as_str()) {
                                *counts.entry(pid.to_string()).or_insert(0) += 1;
                            }
                        }
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(&row.1) {
                        if let Some(a) = v.as_array() {
                            for cid in a.iter().filter_map(|x| x.as_str()) {
                                *cat_counts.entry(cid.to_string()).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    let mut roster: Vec<Value> = vec![];
    if !counts.is_empty() {
        let ph = vec!["?"; counts.len()].join(",");
        let sql = format!("SELECT id, name, image_url FROM performers WHERE id IN ({ph})");
        if let Ok(mut stmt) = conn.prepare(&sql) {
            let keys: Vec<&String> = counts.keys().collect();
            let p = rusqlite::params_from_iter(keys.iter());
            if let Ok(rows) = stmt.query_map(p, |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            }) {
                for row in rows.flatten() {
                    roster.push(json!({
                        "_id": row.0,
                        "name": row.1,
                        "image_url": row.2,
                        "scene_count": counts.get(&row.0).cloned().unwrap_or(0),
                    }));
                }
            }
        }
    }
    roster.sort_by(|a, b| {
        b["scene_count"]
            .as_i64()
            .unwrap_or(0)
            .cmp(&a["scene_count"].as_i64().unwrap_or(0))
            .then_with(|| {
                a["name"]
                    .as_str()
                    .unwrap_or("")
                    .cmp(b["name"].as_str().unwrap_or(""))
            })
    });

    // Favorited scenes of this studio, most recently favorited first.
    let mut favorites: Vec<Value> = vec![];
    if !scene_ids.is_empty() {
        let ph = vec!["?"; scene_ids.len()].join(",");
        let sql = format!(
            "SELECT target_id FROM favorites WHERE type = 'scene' AND target_id IN ({ph})
             ORDER BY created_at DESC"
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            let p = rusqlite::params_from_iter(scene_ids.iter().map(|i| i.to_string()));
            if let Ok(rows) = stmt.query_map(p, |r| r.get::<_, String>(0)) {
                let fav_ids: Vec<i64> =
                    rows.flatten().filter_map(|s| s.parse::<i64>().ok()).collect();
                if !fav_ids.is_empty() {
                    let ph2 = vec!["?"; fav_ids.len()].join(",");
                    let sql2 = format!(
                        "SELECT {} FROM scenes WHERE id IN ({ph2})",
                        crate::api::scenes::SCENE_COLS
                    );
                    if let Ok(mut s2) = conn.prepare(&sql2) {
                        let p2 = rusqlite::params_from_iter(fav_ids.iter());
                        if let Ok(r2) = s2.query_map(p2, crate::api::scenes::scene_from_row) {
                            let mut by_id = std::collections::HashMap::new();
                            for s in r2.flatten() {
                                if let Some(sid) = s["_id"].as_i64() {
                                    by_id.insert(sid, s);
                                }
                            }
                            // Preserve favorite recency order.
                            for fid in fav_ids {
                                if let Some(s) = by_id.remove(&fid) {
                                    favorites.push(s);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Top categories with names.
    let mut top_cats: Vec<(String, i64)> = cat_counts.into_iter().collect();
    top_cats.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    top_cats.truncate(8);
    let cat_names: std::collections::HashMap<String, String> = conn
        .prepare("SELECT id, name FROM categories")
        .map(|mut s| {
            s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let top_categories: Vec<Value> = top_cats
        .into_iter()
        .map(|(cid, n)| {
            json!({
                "_id": cid,
                "name": cat_names.get(&cid).cloned().unwrap_or_else(|| cid.clone()),
                "count": n,
            })
        })
        .collect();

    Ok(Json(json!({
        "studio": studio,
        "stats": {
            "scenes": scene_ids.len(),
            "performers": roster.len(),
            "favorites": favorites.len(),
            "bytes": bytes,
        },
        "performers": roster,
        "favorites": favorites,
        "top_categories": top_categories,
    })))
}

/// `/studios/<id>.<ext>` when a logo file exists, else null (UI falls back
/// to the letter monogram). Extension probe order: svg, png, webp, jpg.
fn logo_url(state: &AppState, id: &str) -> Value {
    for ext in ["svg", "png", "webp", "jpg", "jpeg"] {
        if state.studios_path.join(format!("{id}.{ext}")).exists() {
            return json!(format!("/studios/{id}.{ext}"));
        }
    }
    Value::Null
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> crate::db::Db {
        let db = crate::seed::open_memory();
        let conn = db.lock().unwrap();
        conn.execute("INSERT INTO categories(id, name) VALUES('anal','Anal')", [])
            .unwrap();
        conn.execute("INSERT INTO categories(id, name) VALUES('blowjob','Blowjob')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO studios(id, name, style, signature_categories)
             VALUES('tushy','TUSHY','stub','[\"anal\"]')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO scenes(id, title, studio, studio_id, performer_ids, category_ids)
             VALUES(1,'A','TUSHY','tushy','[]','[\"blowjob\"]')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO scenes(id, title, studio, studio_id, performer_ids, category_ids)
             VALUES(2,'B','TUSHY','tushy','[]','[]')",
            [],
        )
        .unwrap();
        drop(conn);
        db
    }

    #[test]
    fn propagate_unions_without_removing() {
        let db = fixture();
        let conn = db.lock().unwrap();
        // Scene 1 already has blowjob: gains anal, keeps blowjob.
        // Scene 2 gains anal. Returns scenes touched (both).
        assert_eq!(propagate_studio_signatures(&conn, "tushy"), 2);
        let c1: String = conn
            .query_row("SELECT category_ids FROM scenes WHERE id=1", [], |r| r.get(0))
            .unwrap();
        let c2: String = conn
            .query_row("SELECT category_ids FROM scenes WHERE id=2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(c1, "[\"blowjob\",\"anal\"]");
        assert_eq!(c2, "[\"anal\"]");
        // Idempotent: second run touches nothing.
        assert_eq!(propagate_studio_signatures(&conn, "tushy"), 0);
    }

    #[test]
    fn propagate_empty_or_unknown_is_noop() {
        let db = fixture();
        let conn = db.lock().unwrap();
        conn.execute("INSERT INTO studios(id, name) VALUES('empty','Empty')", [])
            .unwrap();
        assert_eq!(propagate_studio_signatures(&conn, "empty"), 0);
        assert_eq!(propagate_studio_signatures(&conn, "ghost"), 0);
    }

    #[test]
    fn signature_drops_unknown_ids() {
        let db = fixture();
        let conn = db.lock().unwrap();
        conn.execute(
            "UPDATE studios SET signature_categories='[\"anal\",\"ghost-cat\"]' WHERE id='tushy'",
            [],
        )
        .unwrap();
        assert_eq!(studio_signature(&conn, "tushy"), vec!["anal".to_string()]);
    }
}
