use crate::api::scenes::{scene_from_row, SCENE_COLS};
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::params;
use serde_json::{json, Value as JValue};
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(search))
}

async fn search(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<JValue> {
    let conn = state.db.lock().unwrap();
    let q = query.get("q").map(|s| s.trim()).unwrap_or("").to_string();
    let page = query.get("page").and_then(|p| p.parse::<i64>().ok()).unwrap_or(1).max(1);
    let limit = query
        .get("limit")
        .and_then(|l| l.parse::<i64>().ok())
        .unwrap_or(30)
        .clamp(1, 200);

    if q.is_empty() {
        return Json(json!({ "scenes": [], "total": 0, "page": 1, "totalPages": 0 }));
    }

    // Split query into field filters ("studio:name", `performer:"Jane Doe"`,
    // "rating:>=4", "duration:>30m", "before:2025-01-01", ...) and free text.
    // Tokenizer respects double quotes so values may contain spaces.
    let mut filters: Vec<(String, String)> = Vec::new();
    let mut free: Vec<String> = Vec::new();
    for token in split_query(&q) {
        if let Some((field, value)) = token.split_once(':') {
            let field = field.to_lowercase();
            if matches!(
                field.as_str(),
                "studio" | "performer" | "category" | "tag" | "resolution" | "status"
                    | "before" | "after" | "rating" | "duration"
            ) {
                let value = unquote(value.trim());
                if !value.is_empty() {
                    filters.push((field, value));
                    continue;
                }
            }
        }
        free.push(token);
    }
    let text = free.join(" ");

    let mut candidate: Option<std::collections::HashSet<i64>> = None;
    let mut intersect = |_conn: &rusqlite::Connection, ids: Vec<i64>| {
        let set: std::collections::HashSet<i64> = ids.into_iter().collect();
        candidate = Some(match candidate.take() {
            Some(cur) => cur.into_iter().filter(|id| set.contains(id)).collect(),
            None => set,
        });
    };

    if !text.is_empty() {
        let like = format!("%{text}%");
        let mut ids: Vec<i64> = Vec::new();
        let mut seen: std::collections::HashSet<i64> = std::collections::HashSet::new();
        let mut add = |id: i64| {
            if seen.insert(id) {
                ids.push(id);
            }
        };

        // 1. Title match
        {
            let mut stmt = conn
                .prepare("SELECT id FROM scenes WHERE title LIKE ?1 COLLATE NOCASE")
                .unwrap();
            for r in stmt.query_map(params![like], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                add(r);
            }
        }

        // 2. Comment text match -> scene_ids
        {
            let mut stmt = conn
                .prepare("SELECT DISTINCT scene_id FROM comments WHERE text LIKE ?1 COLLATE NOCASE")
                .unwrap();
            for r in stmt.query_map(params![like], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                add(r);
            }
        }

        // 3. Performer name match -> scenes via forward truth
        // (scenes.performer_ids; the old reverse cache was dropped in Phase 2B).
        {
            let mut stmt = conn
                .prepare("SELECT id FROM performers WHERE name LIKE ?1 COLLATE NOCASE")
                .unwrap();
            let pids: Vec<String> = stmt
                .query_map(params![like], |r| r.get(0))
                .unwrap()
                .flatten()
                .collect();
            for pid in pids {
                for id in crate::api::performers::scenes_for_performer(&conn, &pid) {
                    add(id);
                }
            }
        }

        // 4. Category name match -> scenes with that category
        {
            let mut stmt = conn
                .prepare("SELECT id FROM categories WHERE name LIKE ?1 COLLATE NOCASE")
                .unwrap();
            let cat_ids: Vec<String> = stmt
                .query_map(params![like], |r| r.get::<_, String>(0))
                .unwrap()
                .flatten()
                .collect();
            for cid in cat_ids {
                let mut s2 = conn
                    .prepare("SELECT id FROM scenes WHERE EXISTS (SELECT 1 FROM json_each(scenes.category_ids) WHERE json_each.value = ?1)")
                    .unwrap();
                for r in s2.query_map(params![cid], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                    add(r);
                }
            }
        }

        // 5. Raw tag match -> scenes carrying that tag
        {
            let mut stmt = conn
                .prepare("SELECT id FROM scenes WHERE EXISTS (SELECT 1 FROM json_each(scenes.tags) WHERE json_each.value LIKE ?1 COLLATE NOCASE)")
                .unwrap();
            for r in stmt.query_map(params![like], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                add(r);
            }
        }

        // 6. Synopsis match -> scenes whose generated description mentions it
        {
            let mut stmt = conn
                .prepare("SELECT id FROM scenes WHERE description LIKE ?1 COLLATE NOCASE")
                .unwrap();
            for r in stmt.query_map(params![like], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                add(r);
            }
        }

        intersect(&conn, ids);
    }

    for (field, value) in &filters {
        let like = format!("%{}%", value);
        let mut ids: Vec<i64> = Vec::new();
        match field.as_str() {
            "studio" => {
                let mut stmt = conn
                    .prepare("SELECT id FROM scenes WHERE studio LIKE ?1 COLLATE NOCASE")
                    .unwrap();
                for r in stmt.query_map(params![like], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                    ids.push(r);
                }
                let mut s2 = conn
                    .prepare("SELECT id FROM studios WHERE name LIKE ?1 COLLATE NOCASE")
                    .unwrap();
                let sids: Vec<String> = s2
                    .query_map(params![like], |r| r.get::<_, String>(0))
                    .unwrap()
                    .flatten()
                    .collect();
                for sid in sids {
                    let mut s3 = conn
                        .prepare("SELECT id FROM scenes WHERE studio_id=?1")
                        .unwrap();
                    for r in s3.query_map(params![sid], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                        ids.push(r);
                    }
                }
            }
            "resolution" => {
                let mut stmt = conn
                    .prepare("SELECT id FROM scenes WHERE resolution LIKE ?1 COLLATE NOCASE")
                    .unwrap();
                for r in stmt.query_map(params![like], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                    ids.push(r);
                }
            }
            "status" => {
                let v = value.to_lowercase();
                if v == "unwatched" {
                    let mut stmt = conn
                        .prepare(
                            "SELECT id FROM scenes WHERE NOT EXISTS
                             (SELECT 1 FROM tracking WHERE tracking.scene_id = scenes.id)",
                        )
                        .unwrap();
                    for r in stmt.query_map([], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                        ids.push(r);
                    }
                } else {
                    // Accept "want" as an alias for the stored "want-to-watch".
                    let want = if v == "want" { "want-to-watch".to_string() } else { v };
                    let mut stmt = conn
                        .prepare(
                            "SELECT id FROM scenes WHERE EXISTS
                             (SELECT 1 FROM tracking WHERE tracking.scene_id = scenes.id AND tracking.status = ?1)",
                        )
                        .unwrap();
                    for r in stmt.query_map(params![want], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                        ids.push(r);
                    }
                }
            }
            // Phase 1: resolve via forward truth, never the deprecated cache.
            "performer" => {
                let mut stmt = conn
                    .prepare("SELECT id FROM performers WHERE name LIKE ?1 COLLATE NOCASE")
                    .unwrap();
                let pids: Vec<String> = stmt
                    .query_map(params![like], |r| r.get(0))
                    .unwrap()
                    .flatten()
                    .collect();
                for pid in pids {
                    for id in crate::api::performers::scenes_for_performer(&conn, &pid) {
                        ids.push(id);
                    }
                }
            }
            "category" => {
                let mut s2 = conn
                    .prepare("SELECT id FROM categories WHERE name LIKE ?1 COLLATE NOCASE")
                    .unwrap();
                let cat_ids: Vec<String> = s2
                    .query_map(params![like], |r| r.get::<_, String>(0))
                    .unwrap()
                    .flatten()
                    .collect();
                for cid in cat_ids {
                    let mut s3 = conn
                        .prepare("SELECT id FROM scenes WHERE EXISTS (SELECT 1 FROM json_each(scenes.category_ids) WHERE json_each.value = ?1)")
                        .unwrap();
                    for r in s3.query_map(params![cid], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                        ids.push(r);
                    }
                }
            }
            "tag" => {
                let mut stmt = conn
                    .prepare("SELECT id FROM scenes WHERE EXISTS (SELECT 1 FROM json_each(scenes.tags) WHERE json_each.value LIKE ?1 COLLATE NOCASE)")
                    .unwrap();
                for r in stmt.query_map(params![like], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                    ids.push(r);
                }
            }
            "before" => {
                // Scene date (ISO-ish string) strictly earlier than the value.
                // Prefixes work: before:2025, before:2025-06.
                let mut stmt = conn
                    .prepare("SELECT id FROM scenes WHERE date IS NOT NULL AND date != '' AND date < ?1")
                    .unwrap();
                for r in stmt.query_map(params![value.clone()], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                    ids.push(r);
                }
            }
            "after" => {
                // Inclusive: after:2024 matches everything dated 2024 or later.
                let mut stmt = conn
                    .prepare("SELECT id FROM scenes WHERE date IS NOT NULL AND date != '' AND date >= ?1")
                    .unwrap();
                for r in stmt.query_map(params![value.clone()], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                    ids.push(r);
                }
            }
            "rating" => {
                // rating:4, rating:>=4, rating:<3. Compares tracking.rating.
                if let Some((op, n)) = parse_cmp(value) {
                    let sql = format!(
                        "SELECT scene_id FROM tracking WHERE rating IS NOT NULL AND rating {op} ?1"
                    );
                    let mut stmt = conn.prepare(&sql).unwrap();
                    for r in stmt.query_map(params![n], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                        ids.push(r);
                    }
                }
            }
            "duration" => {
                // duration:>30m, duration:<=1h, duration:20m. Units s/m/h (default m).
                // tracking.duration is stored in seconds; bare "=" means ±60s.
                // For unplayed scenes without tracking.duration, approximate from size_bytes (~350KB/s avg video bitrate).
                if let Some((op, secs)) = parse_duration(value) {
                    let est_bytes = (secs * 350_000.0) as i64;
                    if op == "=" {
                        let mut stmt = conn
                            .prepare(
                                "SELECT s.id FROM scenes s LEFT JOIN tracking t ON t.scene_id = s.id \
                                 WHERE (t.duration IS NOT NULL AND t.duration > 0 AND t.duration BETWEEN ?1 AND ?2) \
                                    OR ((t.duration IS NULL OR t.duration <= 0) AND s.size_bytes > 0 AND s.size_bytes BETWEEN ?3 AND ?4)",
                            )
                            .unwrap();
                        let min_bytes = ((secs - 60.0).max(0.0) * 350_000.0) as i64;
                        let max_bytes = ((secs + 60.0) * 350_000.0) as i64;
                        for r in stmt
                            .query_map(
                                params![secs - 60.0, secs + 60.0, min_bytes, max_bytes],
                                |r| r.get::<_, i64>(0),
                            )
                            .unwrap()
                            .flatten()
                        {
                            ids.push(r);
                        }
                    } else {
                        let sql = format!(
                            "SELECT s.id FROM scenes s LEFT JOIN tracking t ON t.scene_id = s.id \
                             WHERE (t.duration IS NOT NULL AND t.duration > 0 AND t.duration {op} ?1) \
                                OR ((t.duration IS NULL OR t.duration <= 0) AND s.size_bytes > 0 AND s.size_bytes {op} ?2)"
                        );
                        let mut stmt = conn.prepare(&sql).unwrap();
                        for r in stmt.query_map(params![secs, est_bytes], |r| r.get::<_, i64>(0)).unwrap().flatten() {
                            ids.push(r);
                        }
                    }
                }
            }
            _ => {}
        }
        intersect(&conn, ids);
    }

    let mut ids: Vec<i64> = candidate.unwrap_or_default().into_iter().collect();
    ids.sort_by(|a, b| b.cmp(a));
    let total = ids.len() as i64;
    let start = ((page - 1) * limit) as usize;
    let paginated: Vec<i64> = ids.into_iter().skip(start).take(limit as usize).collect();

    let scenes = if paginated.is_empty() {
        vec![]
    } else {
        let ph = vec!["?"; paginated.len()].join(",");
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {} FROM scenes WHERE id IN ({})",
                SCENE_COLS, ph
            ))
            .unwrap();
        let fetched: Vec<JValue> = stmt
            .query_map(rusqlite::params_from_iter(paginated.iter()), scene_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        // Preserve paginated order
        let order: std::collections::HashMap<i64, usize> = paginated
            .iter()
            .enumerate()
            .map(|(i, id)| (*id, i))
            .collect();
        let mut ordered: Vec<Option<JValue>> = vec![None; paginated.len()];
        for s in fetched {
            if let Some(id) = s["_id"].as_i64() {
                if let Some(&idx) = order.get(&id) {
                    ordered[idx] = Some(s);
                }
            }
        }
        ordered.into_iter().flatten().collect()
    };

    Json(json!({
        "scenes": scenes,
        "total": total,
        "page": page,
        "totalPages": ((total as f64 / limit as f64).ceil() as i64),
        "filters": filters.iter().map(|(f, v)| json!({ "field": f, "value": v })).collect::<Vec<_>>(),
    }))
}

/// Split a query on whitespace, keeping `"quoted phrases"` (with or without
/// a `field:` prefix) together as single tokens. Quotes are preserved here
/// and stripped later by [`unquote`].
fn split_query(q: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for c in q.chars() {
        match c {
            '"' => {
                in_quotes = !in_quotes;
                cur.push(c);
            }
            c if c.is_whitespace() && !in_quotes => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Strip one pair of surrounding double quotes, if present.
fn unquote(s: &str) -> String {
    let s = s.trim();
    if s.len() >= 2 && s.starts_with('"') && s.ends_with('"') {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}

/// Parse `>=4`, `<3`, `=5` or bare `4` into a whitelisted SQL operator
/// plus a number. Returns None when the value is not numeric.
fn parse_cmp(value: &str) -> Option<(&'static str, f64)> {
    let (op, num) = if let Some(n) = value.strip_prefix(">=") {
        (">=", n)
    } else if let Some(n) = value.strip_prefix("<=") {
        ("<=", n)
    } else if let Some(n) = value.strip_prefix('>') {
        (">", n)
    } else if let Some(n) = value.strip_prefix('<') {
        ("<", n)
    } else if let Some(n) = value.strip_prefix('=') {
        ("=", n)
    } else {
        ("=", value)
    };
    num.trim().parse::<f64>().ok().map(|n| (op, n))
}

/// Parse durations like `>30m`, `<=1h`, `45s` or bare `20` (minutes)
/// into an operator plus seconds.
fn parse_duration(value: &str) -> Option<(&'static str, f64)> {
    let (op, rest) = if let Some(n) = value.strip_prefix(">=") {
        (">=", n)
    } else if let Some(n) = value.strip_prefix("<=") {
        ("<=", n)
    } else if let Some(n) = value.strip_prefix('>') {
        (">", n)
    } else if let Some(n) = value.strip_prefix('<') {
        ("<", n)
    } else if let Some(n) = value.strip_prefix('=') {
        ("=", n)
    } else {
        ("=", value)
    };
    let rest = rest.trim();
    let (num, mult) = if let Some(n) = rest.strip_suffix('h').or_else(|| rest.strip_suffix('H')) {
        (n, 3600.0)
    } else if let Some(n) = rest.strip_suffix('m').or_else(|| rest.strip_suffix('M')) {
        (n, 60.0)
    } else if let Some(n) = rest.strip_suffix('s').or_else(|| rest.strip_suffix('S')) {
        (n, 1.0)
    } else {
        (rest, 60.0)
    };
    num.trim().parse::<f64>().ok().map(|n| (op, n * mult))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_quoted_phrases_with_field_prefix() {
        assert_eq!(
            split_query(r#"performer:"Jane Doe" studio:foo 720"#),
            vec!["performer:\"Jane Doe\"", "studio:foo", "720"]
        );
    }

    #[test]
    fn splits_free_quoted_phrase() {
        assert_eq!(split_query(r#""big scene" foo"#), vec!["\"big scene\"", "foo"]);
    }

    #[test]
    fn unquotes_values() {
        assert_eq!(unquote("\"Jane Doe\""), "Jane Doe");
        assert_eq!(unquote("foo"), "foo");
        assert_eq!(unquote("\"\""), "");
    }

    #[test]
    fn parses_rating_comparisons() {
        assert_eq!(parse_cmp(">=4"), Some((">=", 4.0)));
        assert_eq!(parse_cmp("<3"), Some(("<", 3.0)));
        assert_eq!(parse_cmp("4"), Some(("=", 4.0)));
        assert_eq!(parse_cmp("abc"), None);
    }

    #[test]
    fn parses_duration_units() {
        assert_eq!(parse_duration(">30m"), Some((">", 1800.0)));
        assert_eq!(parse_duration("<=1h"), Some(("<=", 3600.0)));
        assert_eq!(parse_duration("45s"), Some(("=", 45.0)));
        assert_eq!(parse_duration("20"), Some(("=", 1200.0)));
        assert_eq!(parse_duration("xx"), None);
    }
}