use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

pub fn routes() -> Router<AppState> {
    Router::new().route("/overview", get(overview))
}

/// Top performers across watched scenes, keyed by canonical performer id
/// (forward truth `scenes.performer_ids`) with display name + portrait.
/// Testable without AppState.
fn top_performers(conn: &rusqlite::Connection) -> Vec<Value> {
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT j.value, COALESCE(p.name, j.value), p.image_url,
                COUNT(*), COALESCE(SUM(t.currentTime),0)
         FROM tracking t JOIN scenes s ON s.id = t.scene_id,
              json_each(CASE WHEN json_valid(s.performer_ids) THEN s.performer_ids ELSE '[]' END) j
              LEFT JOIN performers p ON p.id = j.value
         WHERE t.status = 'watched' AND j.value IS NOT NULL AND j.value != ''
         GROUP BY j.value ORDER BY COUNT(*) DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, Option<String>>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, f64>(4)?,
            ))
        }) {
            for r in rows.flatten() {
                out.push(json!({
                    "id": r.0, "name": r.1, "image_url": r.2,
                    "count": r.3, "seconds": r.4,
                }));
            }
        }
    }
    out
}

/// First existing logo file for a studio id (`<id>.svg|png|jpg|jpeg|webp`),
/// mirroring the `/studios` static mount. Pure + tested.
fn studio_logo(studios_path: &std::path::Path, studio_id: &str) -> Option<String> {
    if studio_id.is_empty() || studio_id.contains(['/', '\\', '.']) {
        return None;
    }
    ["svg", "png", "jpg", "jpeg", "webp"]
        .iter()
        .map(|ext| format!("{studio_id}.{ext}"))
        .find(|f| studios_path.join(f).is_file())
        .map(|f| format!("/studios/{f}"))
}

/// Top studios across watched scenes, keyed by studio_id with display name
/// + on-disk logo URL (null when no logo file exists).
fn top_studios(conn: &rusqlite::Connection, studios_path: &std::path::Path) -> Vec<Value> {
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT s.studio_id, COALESCE(st.name, s.studio, s.studio_id),
                COUNT(*), COALESCE(SUM(t.currentTime),0)
         FROM tracking t JOIN scenes s ON s.id = t.scene_id
              LEFT JOIN studios st ON st.id = s.studio_id
         WHERE t.status = 'watched' AND s.studio_id IS NOT NULL AND s.studio_id != ''
         GROUP BY s.studio_id ORDER BY COUNT(*) DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, i64>(2)?,
                r.get::<_, f64>(3)?,
            ))
        }) {
            for r in rows.flatten() {
                out.push(json!({
                    "id": r.0, "name": r.1, "logo": studio_logo(studios_path, &r.0),
                    "count": r.2, "seconds": r.3,
                }));
            }
        }
    }
    out
}

/// Bucket (currentTime, duration) pairs into completion bands. Pure + tested;
/// the handler only supplies the rows.
fn bucket_completion(pairs: &[(f64, f64)]) -> Value {
    let mut counts = [0i64; 4];
    let mut sum = 0.0f64;
    for (cur, dur) in pairs {
        if *dur <= 0.0 {
            continue;
        }
        let pct = (cur / dur * 100.0).clamp(0.0, 100.0);
        sum += pct;
        counts[if pct < 10.0 {
            0
        } else if pct < 50.0 {
            1
        } else if pct < 90.0 {
            2
        } else {
            3
        }] += 1;
    }
    let n: i64 = counts.iter().sum();
    json!({
        "buckets": [
            { "label": "Abandoned <10%", "max": 10, "count": counts[0] },
            { "label": "Sampled 10–50%", "max": 50, "count": counts[1] },
            { "label": "Watched 50–90%", "max": 90, "count": counts[2] },
            { "label": "Finished 90%+", "max": 100, "count": counts[3] },
        ],
        "avgPct": if n > 0 { (sum / n as f64).round() as i64 } else { 0 },
        "measured": n,
        "finished": counts[3],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completion_buckets_band_and_average() {
        let v = bucket_completion(&[(5.0, 100.0), (30.0, 100.0), (70.0, 100.0), (95.0, 100.0)]);
        let counts: Vec<i64> = v["buckets"].as_array().unwrap().iter().map(|b| b["count"].as_i64().unwrap()).collect();
        assert_eq!(counts, vec![1, 1, 1, 1]);
        assert_eq!(v["avgPct"], 50); // (5+30+70+95)/4
        assert_eq!(v["measured"], 4);
        assert_eq!(v["finished"], 1);
    }

    #[test]
    fn completion_clamps_and_skips_bad_rows() {
        // Over-100% clamps into Finished; zero duration is skipped; empty → zeros.
        let v = bucket_completion(&[(150.0, 100.0), (10.0, 0.0)]);
        assert_eq!(v["buckets"][3]["count"], 1);
        assert_eq!(v["measured"], 1);
        let v = bucket_completion(&[]);
        assert_eq!(v["measured"], 0);
        assert_eq!(v["avgPct"], 0);
    }

    #[test]
    fn top_lists_carry_images_and_logos() {
        let db = crate::seed::open_memory();
        let studio_dir = std::env::temp_dir().join(format!(
            "pfx-logo-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&studio_dir).unwrap();
        std::fs::write(studio_dir.join("s1.svg"), b"<svg/>").unwrap();
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO performers(id,name,image_url) VALUES('p1','Anne','performers/anne.jpg'),('p2','Beth',NULL)",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('s1','Studio One'),('s2','Studio Two')", []).unwrap();
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids,studio_id,studio) VALUES
                 (1,'A','[\"p1\"]','s1','Studio One'),
                 (2,'B','[\"p1\",\"p2\"]','s1','Studio One'),
                 (3,'C','[\"ghost\"]','s2','Studio Two')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO tracking(scene_id,status,currentTime,updated_at) VALUES
                 (1,'watched',100,'2026-01-01T00:00:00Z'),
                 (2,'watched',200,'2026-01-02T00:00:00Z'),
                 (3,'watching',10,'2026-01-03T00:00:00Z')",
                [],
            )
            .unwrap();
        }
        let conn = db.lock().unwrap();
        let ps = top_performers(&conn);
        assert_eq!(ps.len(), 2);
        assert_eq!(ps[0]["id"], "p1");
        assert_eq!(ps[0]["count"], 2);
        assert_eq!(ps[0]["image_url"], "performers/anne.jpg");
        // Performer without a portrait still ranks (null image).
        assert_eq!(ps[1]["id"], "p2");
        assert_eq!(ps[1]["image_url"], serde_json::Value::Null);

        let ss = top_studios(&conn, &studio_dir);
        assert_eq!(ss.len(), 1); // only watched scenes count
        assert_eq!(ss[0]["id"], "s1");
        assert_eq!(ss[0]["logo"], "/studios/s1.svg");

        // Path traversal + missing files yield null, never a path.
        assert_eq!(studio_logo(&studio_dir, "../x"), serde_json::Value::Null);
        assert_eq!(studio_logo(&studio_dir, "s2"), serde_json::Value::Null);
        std::fs::remove_dir_all(&studio_dir).ok();
    }
}

async fn overview(State(state): State<AppState>) -> Json<Value> {
    let conn = state.db.lock().unwrap();
    let count = |sql: &str| -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
    };
    let scenes_total = count("SELECT COUNT(*) FROM scenes");
    let watched = count("SELECT COUNT(*) FROM tracking WHERE status = 'watched'");
    let watching = count("SELECT COUNT(*) FROM tracking WHERE status = 'watching'");
    let want = count("SELECT COUNT(*) FROM tracking WHERE status IN ('want','want-to-watch')");
    let skipped = count("SELECT COUNT(*) FROM tracking WHERE status = 'skip'");
    let seconds: f64 = conn
        .query_row("SELECT COALESCE(SUM(currentTime),0) FROM tracking", [], |r| r.get(0))
        .unwrap_or(0.0);
    let avg_rating: Option<f64> = conn
        .query_row("SELECT AVG(rating) FROM tracking WHERE rating IS NOT NULL", [], |r| r.get(0))
        .ok()
        .flatten();
    let rated: i64 = count("SELECT COUNT(*) FROM tracking WHERE rating IS NOT NULL");

    // ---- Watch-time details (all derived from tracking.currentTime / duration) ----
    let val_f64 = |sql: &str| -> f64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0.0)
    };
    let seconds_today = val_f64(
        "SELECT COALESCE(SUM(currentTime),0) FROM tracking WHERE date(updated_at) = date('now')",
    );
    let seconds_7d = val_f64(
        "SELECT COALESCE(SUM(currentTime),0) FROM tracking WHERE date(updated_at) >= date('now','-6 days')",
    );
    let seconds_30d = val_f64(
        "SELECT COALESCE(SUM(currentTime),0) FROM tracking WHERE date(updated_at) >= date('now','-29 days')",
    );
    let sessions_today = count("SELECT COUNT(*) FROM tracking WHERE date(updated_at) = date('now')");
    let sessions_7d =
        count("SELECT COUNT(*) FROM tracking WHERE date(updated_at) >= date('now','-6 days')");
    let sessions_30d =
        count("SELECT COUNT(*) FROM tracking WHERE date(updated_at) >= date('now','-29 days')");
    let total_duration: f64 = val_f64(
        "SELECT COALESCE(SUM(duration),0) FROM tracking WHERE duration IS NOT NULL AND duration > 0",
    );
    let remaining_seconds: f64 = val_f64(
        "SELECT COALESCE(SUM(CASE WHEN duration > currentTime THEN duration - currentTime ELSE 0 END),0) FROM tracking WHERE duration IS NOT NULL AND duration > 0",
    );
    let avg_per_day_30 = if seconds_30d > 0.0 { seconds_30d / 30.0 } else { 0.0 };
    let avg_per_scene = if watched > 0 { seconds / watched as f64 } else { 0.0 };

    // Daily trend, last 30 days (zero-filled so the chart is continuous).
    let mut daily_map: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT substr(updated_at,1,10), COUNT(*), COALESCE(SUM(currentTime),0)
         FROM tracking WHERE date(updated_at) >= date('now','-29 days')
         GROUP BY substr(updated_at,1,10)",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
            ))
        }) {
            for r in rows.flatten() {
                if r.0.len() >= 10 {
                    daily_map.insert(r.0, (r.1, r.2));
                }
            }
        }
    }
    let mut daily = Vec::new();
    let today = chrono::Utc::now().date_naive();
    for back in (0..30).rev() {
        let d = today - chrono::Duration::days(back);
        let key = d.format("%Y-%m-%d").to_string();
        let (c, s) = daily_map.get(&key).cloned().unwrap_or((0, 0.0));
        daily.push(json!({ "day": key, "count": c, "seconds": s }));
    }

    // Activity heatmap, last 120 days (day -> seconds watched). Powers the
    // GitHub-style calendar + streaks; zero-filled like `daily`.
    let mut heat_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT substr(updated_at,1,10), COALESCE(SUM(currentTime),0)
         FROM tracking WHERE date(updated_at) >= date('now','-119 days')
         GROUP BY substr(updated_at,1,10)",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, f64>(1)?,
            ))
        }) {
            for r in rows.flatten() {
                if r.0.len() >= 10 {
                    heat_map.insert(r.0, r.1);
                }
            }
        }
    }
    let mut heatmap = Vec::new();
    for back in (0..120).rev() {
        let d = today - chrono::Duration::days(back);
        let key = d.format("%Y-%m-%d").to_string();
        heatmap.push(json!({ "day": key, "seconds": heat_map.get(&key).cloned().unwrap_or(0.0) }));
    }

    // Completion: how much of each started scene was actually watched
    // (currentTime/duration). Buckets + average over rows with a duration.
    let mut pairs: Vec<(f64, f64)> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT currentTime, duration FROM tracking
         WHERE duration IS NOT NULL AND duration > 0 AND currentTime IS NOT NULL AND currentTime > 0",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, f64>(0)?, r.get::<_, f64>(1)?))
        }) {
            pairs.extend(rows.flatten());
        }
    }
    let completion = bucket_completion(&pairs);

    // Rating distribution 1..5.
    let mut rating_buckets = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT rating, COUNT(*) FROM tracking WHERE rating BETWEEN 1 AND 5 GROUP BY rating ORDER BY rating",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        }) {
            for r in rows.flatten() {
                rating_buckets.push(json!({ "rating": r.0, "count": r.1 }));
            }
        }
    }

    // Top scenes by watch time (with title for display).
    let mut top_scenes = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.scene_id, COALESCE(s.title, s.file_name, ''), COALESCE(t.currentTime,0), t.duration
         FROM tracking t LEFT JOIN scenes s ON s.id = t.scene_id
         ORDER BY t.currentTime DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, Option<f64>>(3)?,
            ))
        }) {
            for r in rows.flatten() {
                top_scenes.push(json!({
                    "scene_id": r.0, "title": r.1, "seconds": r.2, "duration": r.3,
                }));
            }
        }
    }

    // Top studios by watched scenes (with seconds watched). Keyed by
    // studio_id so the UI can link + show logos; logo resolved from disk.
    let top_studios = top_studios(&conn, &state.studios_path);

    // Top performers (canonical ids) across watched scenes (with seconds
    // watched). Joins performers for display name + portrait.
    let top_performers = top_performers(&conn);
    let mut top_categories = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(c.name, j.value), COUNT(*), COALESCE(SUM(t.currentTime),0)
         FROM tracking t JOIN scenes s ON s.id = t.scene_id,
              json_each(s.category_ids) j LEFT JOIN categories c ON c.id = j.value
         WHERE t.status = 'watched'
         GROUP BY j.value ORDER BY COUNT(*) DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
            ))
        }) {
            for r in rows.flatten() {
                top_categories.push(json!({ "name": r.0, "count": r.1, "seconds": r.2 }));
            }
        }
    }

    // Weekly activity, last 8 weeks (year-week buckets).
    let mut weekly = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT strftime('%Y-W%W', updated_at), COUNT(*), COALESCE(SUM(currentTime),0)
         FROM tracking WHERE updated_at IS NOT NULL AND updated_at != ''
         GROUP BY strftime('%Y-W%W', updated_at) ORDER BY 1 DESC LIMIT 8",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
            ))
        }) {
            let mut w: Vec<_> = rows.flatten().collect();
            w.reverse();
            for r in w {
                weekly.push(json!({ "week": r.0, "count": r.1, "seconds": r.2 }));
            }
        }
    }

    // Exact wall-clock watch time from the session log (0 when empty / legacy DB).
    let (exact_total, exact_today, exact_7d, exact_30d, exact_sessions, exact_events) =
        crate::api::watch_events::exact_totals(&conn);

    Json(json!({
        "scenesTotal": scenes_total,
        "watched": watched,
        "watching": watching,
        "want": want,
        "skipped": skipped,
        "watchTimeExact": {
            "total": exact_total,
            "today": exact_today,
            "last7d": exact_7d,
            "last30d": exact_30d,
            "sessions": exact_sessions,
            "events": exact_events,
        },
        "completionPct": if scenes_total > 0 { (watched as f64 / scenes_total as f64 * 100.0).round() as i64 } else { 0 },
        "secondsWatched": seconds,
        "avgRating": avg_rating,
        "rated": rated,
        "topStudios": top_studios,
        "topCategories": top_categories,
        "topPerformers": top_performers,
        "weekly": weekly,
        "watchTime": {
            "total": seconds,
            "today": seconds_today,
            "last7d": seconds_7d,
            "last30d": seconds_30d,
            "avgPerDay30": avg_per_day_30,
            "avgPerScene": avg_per_scene,
            "totalDuration": total_duration,
            "remaining": remaining_seconds,
            "sessionsToday": sessions_today,
            "sessions7d": sessions_7d,
            "sessions30d": sessions_30d,
        },
        "daily": daily,
        "heatmap": heatmap,
        "completion": completion,
        "topScenes": top_scenes,
        "ratingBuckets": rating_buckets,
    }))
}
