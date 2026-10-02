//! Fetch-from-URL: scrape a freepornvideos.xxx video page, download the file
//! into the library, and register the scene row.
//!
//! Single-flight: if a job is already queued/downloading, POST returns the
//! existing job id instead of starting a duplicate (the site rate-limits
//! aggressively, so no parallel fetching).
//!
//! - POST `/api/library/fetch` `{url, res?}` → `{job_id, dedup?}`
//! - GET  `/api/library/fetch/{job}` → job status (poll for progress)

use crate::api::now_iso;
use crate::state::{AppState, FetchJobs};
use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const SITE_HOST: &str = "www.freepornvideos.xxx";
const UA: &str = "PersonalFlix/1.0 (local media library)";
const MIN_BYTES: u64 = 10 * 1024 * 1024;
const RES_FALLBACK: &[&str] = &["480m", "480", "720m", "720p", "1080p"];

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(start_fetch))
        .route("/{job}", get(fetch_status))
}

/// Registered in library.rs as POST /api/library/fetch-backfill (kept out of
/// the /fetch nest so the `/{job}` capture can never shadow it).

#[derive(Deserialize)]
struct FetchRequest {
    url: String,
    res: Option<String>,
}

#[derive(Serialize, Clone, Default)]
pub struct FetchJob {
    pub job_id: String,
    pub url: String,
    pub state: String,
    pub bytes: u64,
    pub total: Option<u64>,
    pub scene_id: Option<i64>,
    pub title: Option<String>,
    pub message: Option<String>,
    pub updated_at: String,
}

async fn start_fetch(State(state): State<AppState>, Json(req): Json<FetchRequest>) -> Json<serde_json::Value> {
    let url = req.url.trim().to_string();
    let res = req.res.unwrap_or_else(|| "480m".to_string());
    let (site_id, valid) = parse_video_url(&url);
    if !valid {
        return Json(serde_json::json!({ "error": "URL must look like https://www.freepornvideos.xxx/videos/<id>/<slug>/" }));
    }
    // Single-flight: reuse a live job for any URL.
    {
        let jobs = state.fetch_jobs.lock().unwrap();
        if let Some(live) = jobs.values().find(|j| j.state == "queued" || j.state == "downloading") {
            return Json(serde_json::json!({ "job_id": live.job_id, "dedup": true }));
        }
    }
    let job_id = format!("fpv-{site_id}");
    {
        let mut jobs = state.fetch_jobs.lock().unwrap();
        jobs.insert(
            job_id.clone(),
            FetchJob {
                job_id: job_id.clone(),
                url: url.clone(),
                state: "queued".to_string(),
                updated_at: now_iso(),
                ..Default::default()
            },
        );
    }
    let st = state.clone();
    tokio::spawn(async move { run_fetch(st, job_id, url, res).await });
    let jobs = state.fetch_jobs.lock().unwrap();
    Json(serde_json::json!({ "job_id": jobs.keys().last().cloned().unwrap_or_default() }))
}

async fn fetch_status(State(state): State<AppState>, Path(job): Path<String>) -> Json<serde_json::Value> {
    let jobs = state.fetch_jobs.lock().unwrap();
    match jobs.get(&job) {
        Some(j) => Json(serde_json::json!(j)),
        None => Json(serde_json::json!({ "error": "unknown job" })),
    }
}

/// Returns (site_id, valid). Host allow-list doubles as SSRF protection:
/// only the known video site is ever fetched.
pub(crate) fn parse_video_url(url: &str) -> (String, bool) {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or("");
    let mut parts = rest.splitn(2, '/');
    let host = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");
    if !host.eq_ignore_ascii_case(SITE_HOST) {
        return (String::new(), false);
    }
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segs.len() >= 2 && segs[0] == "videos" && segs[1].chars().all(|c| c.is_ascii_digit()) {
        return (segs[1].to_string(), true);
    }
    (String::new(), false)
}

#[derive(Debug, Default, PartialEq)]
pub(crate) struct PageDetails {
    pub site_id: String,
    pub studio: String,
    pub title: String,
    pub performers: Vec<String>,
    pub date_iso: String,
    pub date_file: String,
    pub dur_sec: i64,
    pub thumb: String,
    pub file_url: String,
    pub file_res: String,
    /// Raw keyword tags from the page (performer names already removed).
    pub tags: Vec<String>,
}

fn between<'a>(html: &'a str, start: &str, end: &str) -> &'a str {
    match html.find(start) {
        Some(i) => {
            let rest = &html[i + start.len()..];
            match rest.find(end) {
                Some(j) => &rest[..j],
                None => "",
            }
        }
        None => "",
    }
}

fn listing(html: &str, prefix: &str) -> Vec<String> {
    // Extracts link texts for hrefs starting with `prefix` (e.g. "/models/").
    let mut out = Vec::new();
    let mut rest = html;
    while let Some(i) = rest.find(prefix) {
        let after = &rest[i..];
        if let Some(gt) = after.find('>') {
            let text = &after[gt + 1..];
            if let Some(lt) = text.find('<') {
                let name = text[..lt].trim().to_string();
                if !name.is_empty() && !out.contains(&name) {
                    out.push(name);
                }
            }
            rest = &after[gt + 1..];
        } else {
            break;
        }
    }
    out
}

fn parse_iso_duration(s: &str) -> i64 {
    // PT0H22M37S / PT33M37S / PT56S
    let mut total = 0i64;
    let mut num = String::new();
    for c in s.chars() {
        if c.is_ascii_digit() {
            num.push(c);
        } else {
            let n: i64 = num.parse().unwrap_or(0);
            num.clear();
            match c {
                'H' => total += n * 3600,
                'M' => total += n * 60,
                'S' => total += n,
                _ => {}
            }
        }
    }
    total
}

/// Pure parser (unit-tested): video page HTML → details + best download URL
/// for the requested resolution (falls back through RES_FALLBACK).
pub(crate) fn parse_video_page(site_id: &str, html: &str, want_res: &str) -> Result<PageDetails, String> {
    if html.contains("temporary unavailable") {
        return Err("site blocked the fetch (rate-limit). Wait a few minutes and retry.".to_string());
    }
    let title_tag = between(html, "<title>", "</title>").trim().to_string();
    let mut studio = title_tag
        .strip_prefix('[')
        .and_then(|t| t.split(']').next())
        .unwrap_or("")
        .trim()
        .to_string();
    let ld = {
        let start = "<script type=\"application/ld+json\">";
        between(html, start, "</script>").to_string()
    };
    let mut d = PageDetails { site_id: site_id.to_string(), ..Default::default() };
    let field = |key: &str| -> String {
        let pat = format!("\"{key}\":");
        match ld.find(&pat) {
            Some(i) => {
                let rest = ld[i + pat.len()..].trim_start();
                if rest.starts_with('"') {
                    let inner = &rest[1..];
                    inner.split('"').next().unwrap_or("").to_string()
                } else {
                    String::new()
                }
            }
            None => String::new(),
        }
    };
    let name = field("name");
    d.title = name
        .split(" - ")
        .last()
        .unwrap_or("")
        .trim()
        .to_string();
    if d.title.is_empty() {
        // Fallback: title tag minus "[Studio] - " prefix and trailing promo.
        let t = title_tag
            .split_once(" - ")
            .map(|(_, t)| t)
            .unwrap_or(&title_tag)
            .to_string();
        d.title = t.split('|').next().unwrap_or("").trim().to_string();
    }
    let up = field("uploadDate");
    if up.len() >= 10 {
        d.date_iso = up[..10].to_string();
        let p: Vec<&str> = d.date_iso.split('-').collect();
        if p.len() == 3 {
            d.date_file = format!("{}.{}.{}", p[2], p[1], p[0]);
        }
    }
    d.dur_sec = parse_iso_duration(&field("duration"));
    d.thumb = field("thumbnailUrl");
    d.performers = listing(html, "/models/");
    let sites = listing(html, "/sites/");
    if studio.is_empty() {
        studio = sites.first().cloned().unwrap_or_default();
    }
    d.studio = studio;
    // Keyword tags (meta keywords minus performer names).
    if let Some(meta) = html.find("<meta name=\"keywords\"") {
        let tail = &html[meta..];
        if let Some(cs) = tail.find("content=\"") {
            let inner = &tail[cs + 9..];
            if let Some(end) = inner.find('"') {
                d.tags = inner[..end]
                    .split(',')
                    .map(|t| t.trim().to_string())
                    .filter(|t| {
                        !t.is_empty()
                            && !d.performers.iter().any(|p| p.eq_ignore_ascii_case(t))
                    })
                    .collect();
            }
        }
    }
    // Download links: prefer requested res, else first fallback present.
    let mut links: Vec<String> = Vec::new();
    let mut rest = html;
    while let Some(i) = rest.find("https://www.freepornvideos.xxx/get_file/") {
        let tail = &rest[i..];
        let end = tail
            .find(|c: char| c == '"' || c == '\'' || c.is_whitespace() || c == '<')
            .unwrap_or(tail.len());
        let link = tail[..end].to_string();
        if !links.contains(&link) {
            links.push(link);
        }
        rest = &tail[end.min(tail.len().saturating_sub(0) + 1).min(tail.len())..];
        if rest.is_empty() {
            break;
        }
    }
    let mut order = vec![want_res.to_string()];
    for r in RES_FALLBACK {
        if *r != want_res {
            order.push(r.to_string());
        }
    }
    for res in order {
        let needle = format!("_{res}.mp4");
        if let Some(link) = links.iter().find(|l| l.contains(&needle)) {
            d.file_url = link.clone();
            d.file_res = res;
            break;
        }
    }
    if d.file_url.is_empty() {
        return Err("no downloadable file link found on the page".to_string());
    }
    if d.title.is_empty() || d.studio.is_empty() {
        return Err("page parsed but title/studio missing".to_string());
    }
    Ok(d)
}

pub(crate) fn sanitize_filename(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
        .collect();
    cleaned.trim().trim_matches('.').to_string()
}

pub(crate) fn slugify(s: &str) -> String {
    let lower = s.to_lowercase().replace('\'', "").replace('.', "");
    let mut out = String::new();
    let mut dash = false;
    for c in lower.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

pub(crate) fn display_filename(d: &PageDetails) -> String {
    let head = if d.performers.is_empty() {
        d.title.clone()
    } else {
        format!("{} - {}", d.performers.join(" - "), d.title)
    };
    sanitize_filename(&format!("{}  {}_{}.mp4", head, d.date_file, d.file_res))
}

fn set_job(state: &AppState, job_id: &str, f: impl FnOnce(&mut FetchJob)) {
    let mut jobs = state.fetch_jobs.lock().unwrap();
    if let Some(j) = jobs.get_mut(job_id) {
        f(j);
        j.updated_at = now_iso();
    }
}

async fn run_fetch(state: AppState, job_id: String, url: String, res: String) {
    if let Err(e) = run_fetch_inner(&state, &job_id, &url, &res).await {
        set_job(&state, &job_id, |j| {
            j.state = "error".to_string();
            j.message = Some(e);
        });
    }
}

async fn run_fetch_inner(state: &AppState, job_id: &str, url: &str, res: &str) -> Result<(), String> {
    let (site_id, _) = parse_video_url(url);
    set_job(state, job_id, |j| j.state = "downloading".to_string());

    let client = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let html = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("page fetch failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("page read failed: {e}"))?;
    let d = parse_video_page(&site_id, &html, res)?;
    set_job(state, job_id, |j| {
        j.title = Some(format!("{} - {}", d.studio, d.title));
    });

    // Studio dir: exact match, else case-insensitive, else create.
    let studio_dir = {
        let exact = state.library_path.join(&d.studio);
        if exact.is_dir() {
            exact
        } else {
            let mut found = None;
            if let Ok(entries) = std::fs::read_dir(&state.library_path) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    if name.eq_ignore_ascii_case(&d.studio) {
                        found = Some(e.path());
                        break;
                    }
                }
            }
            match found {
                Some(p) => p,
                None => {
                    let p = state.library_path.join(&d.studio);
                    std::fs::create_dir_all(&p).map_err(|e| format!("mkdir studio: {e}"))?;
                    p
                }
            }
        }
    };
    let file_name = display_filename(&d);
    let dest = studio_dir.join(&file_name);
    if dest.exists() {
        return Err(format!("already exists: {}", dest.display()));
    }

    // Stream download with progress.
    let resp = client
        .get(&d.file_url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download HTTP {}", resp.status()));
    }
    let total = resp.content_length();
    set_job(state, job_id, |j| j.total = total);
    let part = studio_dir.join(format!("{file_name}.part"));
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| format!("create file: {e}"))?;
    let mut stream = resp.bytes_stream();
    let mut bytes = 0u64;
    {
        let state_c = state.clone();
        let job_c = job_id.to_string();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("download chunk: {e}"))?;
            tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
                .await
                .map_err(|e| format!("write file: {e}"))?;
            bytes += chunk.len() as u64;
            let mut jobs = state_c.fetch_jobs.lock().unwrap();
            if let Some(j) = jobs.get_mut(&job_c) {
                j.bytes = bytes;
                j.updated_at = now_iso();
            }
        }
    }
    if bytes < MIN_BYTES {
        tokio::fs::remove_file(&part).await.ok();
        return Err(format!("suspiciously small file ({bytes} bytes), removed"));
    }
    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| format!("finalize file: {e}"))?;

    // Register scene row (short DB locks only).
    let studio_id = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT id FROM studios WHERE lower(id)=lower(?1) OR lower(name)=lower(?1) LIMIT 1",
            rusqlite::params![d.studio],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| slugify(&d.studio))
    };
    // Map page tags onto known category ids (exact, case-insensitive).
    let category_ids: Vec<String> = {
        let conn = state.db.lock().unwrap();
        let mut map: HashMap<String, String> = HashMap::new();
        if let Ok(mut stmt) = conn.prepare("SELECT id, name FROM categories") {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            }) {
                for row in rows.flatten() {
                    map.entry(row.1.to_lowercase()).or_insert(row.0);
                }
            }
        }
        let mut ids: Vec<String> = d
            .tags
            .iter()
            .filter_map(|t| map.get(&t.to_lowercase()).cloned())
            .collect();
        ids.sort();
        ids.dedup();
        // Fetched scenes inherit their studio's signature categories too.
        for s in crate::api::studios::studio_signature(&conn, &studio_id) {
            if !ids.iter().any(|x| x == &s) {
                ids.push(s);
            }
        }
        ids
    };
    let performer_ids: Vec<String> = {
        let conn = state.db.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id FROM performers WHERE name=?1")
            .map_err(|e| format!("db: {e}"))?;
        let mut ids = Vec::new();
        for name in &d.performers {
            if let Ok(id) = stmt.query_row([name], |r| r.get::<_, String>(0)) {
                ids.push(id);
            }
        }
        ids
    };
    let rel_dir = studio_dir
        .strip_prefix(&state.library_path)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| d.studio.clone());
    let lib_name = state
        .library_path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Porn".to_string());
    let stored = format!("{lib_name}/{rel_dir}/{file_name}");
    let size = std::fs::metadata(&dest).map(|m| m.len() as i64).unwrap_or(0);
    let mtime = std::fs::metadata(&dest)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|x| x.as_secs_f64())
        .unwrap_or(0.0);
    let pid = site_id.parse::<i64>().unwrap_or(0);
    {
        let conn = state.db.lock().unwrap();
        let performers_json = serde_json::to_string(&d.performers).unwrap_or_else(|_| "[]".to_string());
        let ids_json = serde_json::to_string(&performer_ids).unwrap_or_else(|_| "[]".to_string());
        let cats_json = serde_json::to_string(&category_ids).unwrap_or_else(|_| "[]".to_string());
        let tags_json = serde_json::to_string(&d.tags).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR IGNORE INTO scenes
             (id, file_name, original_name, resolution, studio, studio_id, title,
              performers, performer_ids, date, network, source_url, file_path,
              category_ids, related_ids, file_exists, size_bytes, mtime, tags)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'',?11,?12,?13,'[]',1,?14,?15,?16)",
            rusqlite::params![
                pid,
                file_name,
                format!("{site_id}_{}.mp4", d.file_res),
                d.file_res,
                d.studio,
                studio_id,
                d.title,
                performers_json,
                ids_json,
                d.date_iso,
                url,
                stored,
                cats_json,
                size,
                mtime,
                tags_json,
            ],
        )
        .map_err(|e| format!("db insert: {e}"))?;
    }
    set_job(state, job_id, |j| {
        j.state = "done".to_string();
        j.bytes = bytes;
        j.scene_id = Some(pid);
        j.message = Some(file_name.clone());
    });
    Ok(())
}

#[allow(dead_code)]
pub fn active_job(jobs: &FetchJobs) -> Option<FetchJob> {
    let map = jobs.lock().unwrap();
    map.values()
        .find(|j| j.state == "queued" || j.state == "downloading")
        .cloned()
}

// --- Performer backfill ------------------------------------------------------
// Model pages carry no bio/photo worth importing (title + video listing only),
// so backfill links display names to canonical performer rows: slugify the
// name, verify the /models/<slug>/ page actually belongs to them, then create
// the performer row and set scenes.performer_ids. Display names that fail
// verification stay unlinked (reported as skipped, never guessed).

#[derive(Deserialize)]
pub struct BackfillRequest {
    pub dry_run: Option<bool>,
    /// When true, also cover existing performer rows missing a photo file.
    pub existing: Option<bool>,
    /// When true, also parse performer candidates out of descriptive
    /// filenames for scenes whose performers list is still empty.
    pub filenames: Option<bool>,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackfillItem {
    pub name: String,
    pub slug: String,
    pub url: String,
    pub scenes: Vec<i64>,
    pub verified: bool,
    /// "link" = create row + set scene links, "photo" = refresh existing row.
    pub kind: String,
    pub avatar_url: Option<String>,
}

pub(crate) fn model_url(slug: &str) -> String {
    format!("https://www.freepornvideos.xxx/models/{slug}/")
}

/// True when the model page belongs to `name` (h1 is "<Name>'s Videos").
pub(crate) fn verify_model_page(name: &str, html: &str) -> bool {
    if html.contains("temporary unavailable") || html.len() < 5_000 {
        return false;
    }
    let lower_html = html.to_lowercase();
    let lower_name = name.to_lowercase();
    lower_html.contains(&format!("{}'s videos", lower_name))
        || lower_html.contains(&format!("{}’s videos", lower_name))
}

/// Model-page avatar: the <img> whose src lives under /contents/models/.
/// Prefers the tag whose alt names the performer, else the first such image.
pub(crate) fn parse_model_avatar(html: &str, name: &str) -> Option<String> {
    let mut fallback: Option<String> = None;
    let mut rest = html;
    while let Some(i) = rest.find("<img") {
        let tag = &rest[i..];
        let end = tag.find('>').map(|j| i + j + 1).unwrap_or(rest.len());
        let tag = &rest[i..end];
        rest = &rest[end..];
        if !tag.contains("/contents/models/") {
            continue;
        }
        let src = match tag.find("src=\"") {
            Some(s) => {
                let t = &tag[s + 5..];
                t.split('"').next().unwrap_or("").to_string()
            }
            None => continue,
        };
        if src.is_empty() || src.starts_with("data:") {
            continue;
        }
        if fallback.is_none() {
            fallback = Some(src.clone());
        }
        if tag.to_lowercase().contains(&name.to_lowercase()) {
            return Some(src);
        }
    }
    fallback
}

/// Split a descriptive filename into (title, date_iso, performer candidates).
/// Two conventions exist in this library:
/// - long form  `P1 - P2 - Title  DD.MM.YYYY_RES.mp4`
/// - short form `Title - P1, P2.mp4` (commas only ever separate performer
///   lists here, never titles)
/// The title boundary is anchored on the LAST segment matching a known
/// performer (`is_known`, case-insensitive): everything up to and including
/// it are candidates, everything after is title tail pending the extension
/// check in `extend_candidates`. With no usable anchor it falls back to the
/// comma rule, then to pure positional (title = last segment). Unknown
/// segments are model-verified downstream, never trusted.
/// Returns None when the name carries no usable split (index*.mp4, bare ids).
pub(crate) fn split_filename_candidates(
    file_name: &str,
    is_known: &dyn Fn(&str) -> bool,
) -> Option<(String, String, Vec<String>, Vec<String>)> {
    let stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(file_name);
    // Trailing "  DD.MM.YYYY_RES" date stamp (long form).
    let (core, date_iso) = match stem.rsplit_once("  ") {
        Some((head, tail)) => {
            let parts: Vec<&str> = tail.split('_').collect();
            if parts.len() == 2 && parts[0].len() == 10 {
                let dp: Vec<&str> = parts[0].split('.').collect();
                if dp.len() == 3
                    && dp[0].len() == 2
                    && dp[1].len() == 2
                    && dp[2].len() == 4
                    && dp.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
                {
                    (head.to_string(), format!("{}-{}-{}", dp[2], dp[1], dp[0]))
                } else {
                    (stem.to_string(), String::new())
                }
            } else {
                (stem.to_string(), String::new())
            }
        }
        None => (stem.to_string(), String::new()),
    };
    let segs: Vec<String> = core.split(" - ").map(|s| s.trim().to_string()).collect();
    if segs.len() < 2 {
        return None;
    }
    let (title, candidates, tail) = {
        // Anchor on the last known-performer segment.
        let mut anchor: Option<usize> = None;
        for (i, s) in segs.iter().enumerate() {
            if is_known(s) {
                anchor = Some(i);
            }
        }
        match anchor {
            Some(i) if i + 1 < segs.len() => (
                String::new(),
                segs[..=i].to_vec(),
                segs[i + 1..].to_vec(),
            ),
            _ if segs[1..].join(" ").contains(',') => {
                // Short form: title first, performers comma-separated after.
                let cands: Vec<String> = segs[1..]
                    .join(" - ")
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                (segs[0].clone(), cands, Vec::new())
            }
            // Positional fallback (title = last segment).
            _ => (
                segs[segs.len() - 1].clone(),
                segs[..segs.len() - 1].to_vec(),
                Vec::new(),
            ),
        }
    };
    if candidates.is_empty() {
        return None;
    }
    Some((title, date_iso, candidates, tail))
}

/// Extension pass for anchored splits: leading title-tail segments that
/// verify as performers move into the candidates (e.g. "Marykate Moss" in
/// "Emily Willis - Marykate Moss - Reconnecting"). Stops at the first
/// segment that is neither known nor verified — the rest stays title, and
/// at least one title segment is always kept.
/// `is_performer` must cover known rows AND verified newcomers.
pub(crate) fn extend_candidates(
    mut candidates: Vec<String>,
    mut tail: Vec<String>,
    is_performer: &dyn Fn(&str) -> bool,
) -> (String, Vec<String>) {
    while tail.len() > 1 {
        match tail.first() {
            Some(head) if is_performer(head) => {
                let head = tail.remove(0);
                if !candidates.contains(&head) {
                    candidates.push(head);
                }
            }
            _ => break,
        }
    }
    (tail.join(" - "), candidates)
}

/// Strip a trailing "  DD.MM.YYYY_RES" date stamp from a file stem,
/// returning the descriptive core. Used to recognize scanner-placeholder
/// titles (the scanner stores the parsed core, not the raw stem).
pub(crate) fn strip_date_suffix(stem: &str) -> String {
    match stem.rsplit_once("  ") {
        Some((head, tail)) => {
            let parts: Vec<&str> = tail.split('_').collect();
            if parts.len() == 2 && parts[0].len() == 10 {
                let dp: Vec<&str> = parts[0].split('.').collect();
                if dp.len() == 3
                    && dp[0].len() == 2
                    && dp[1].len() == 2
                    && dp[2].len() == 4
                    && dp.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
                {
                    return head.to_string();
                }
            }
            stem.to_string()
        }
        None => stem.to_string(),
    }
}

/// Merge new ids into an existing performer_ids JSON array (dedupe, preserve).
pub(crate) fn merge_ids(existing: &str, extra: &[String]) -> String {
    let mut ids: Vec<String> = serde_json::from_str(existing).unwrap_or_default();
    for id in extra {
        if !ids.iter().any(|x| x == id) {
            ids.push(id.clone());
        }
    }
    serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string())
}

/// Display names across all scenes that have no exact performer row.
fn missing_performer_names(conn: &rusqlite::Connection) -> Vec<(String, Vec<i64>)> {
    let known: HashSet<String> = conn
        .prepare("SELECT name FROM performers WHERE name IS NOT NULL")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let mut order: Vec<String> = Vec::new();
    let mut scenes_by: HashMap<String, Vec<i64>> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, performers FROM scenes") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?))
        }) {
            for row in rows.flatten() {
                let names: Vec<String> = row
                    .1
                    .as_deref()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                    .and_then(|v| {
                        v.as_array().map(|a| {
                            a.iter().filter_map(|e| e.as_str().map(|x| x.to_string())).collect()
                        })
                    })
                    .unwrap_or_default();
                for n in names {
                    let name = n.trim().to_string();
                    if name.is_empty() || known.contains(&name) {
                        continue;
                    }
                    scenes_by.entry(name.clone()).or_default().push(row.0);
                    if !order.contains(&name) {
                        order.push(name);
                    }
                }
            }
        }
    }
    order
        .into_iter()
        .map(|n| {
            let scenes = scenes_by.remove(&n).unwrap_or_default();
            (n, scenes)
        })
        .collect()
}

/// Existing performer rows that need a photo: empty image_url, or the file
/// itself missing from <library>/performers/.
fn photo_needs(conn: &rusqlite::Connection, performers_path: &std::path::Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, name, slug, image_url FROM performers") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        }) {
            for row in rows.flatten() {
                let name = row.1.clone().unwrap_or_default();
                if name.trim().is_empty() {
                    continue;
                }
                let slug = row.2.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| slugify(&name));
                let file_ok = row.3.as_deref().map(|u| {
                    let base = u.rsplit(['/', '\\']).next().unwrap_or("");
                    !base.is_empty() && performers_path.join(base).exists()
                }).unwrap_or(false);
                if !file_ok {
                    out.push((name, slug));
                }
            }
        }
    }
    out
}

/// One scene whose performers list is empty but whose filename carries
/// performer candidates (descriptive long/short form names).
#[derive(Serialize, Clone, Debug)]
pub struct FilenameItem {
    pub scene_id: i64,
    pub file_name: String,
    pub title_fix: String,
    pub date_fix: String,
    /// Segments after the title anchor, pending the extension check.
    pub title_tail: Vec<String>,
    pub candidates: Vec<String>,
    /// (name, id) pairs already canonical in the performers table.
    pub known: Vec<(String, String)>,
    /// Candidate names with no performer row yet (need model verification).
    pub unknown: Vec<String>,
    /// Unknown names verified against their model pages.
    pub verified: Vec<String>,
}

/// Scenes with an empty performers list and a splittable descriptive name.
fn filename_items(conn: &rusqlite::Connection) -> Vec<FilenameItem> {
    let known: HashMap<String, String> = conn
        .prepare("SELECT name, id FROM performers WHERE name IS NOT NULL")
        .map(|mut s| {
            s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, file_name, COALESCE(performers,'[]') FROM scenes",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        }) {
            for row in rows.flatten() {
                let has_names: bool = serde_json::from_str::<serde_json::Value>(&row.2)
                    .ok()
                    .and_then(|v| v.as_array().map(|a| !a.is_empty()))
                    .unwrap_or(false);
                if has_names {
                    continue;
                }
                let is_known = |s: &str| {
                    let l = s.to_lowercase();
                    known.keys().any(|k| k.to_lowercase() == l)
                };
                if let Some((title, date, cands, tail)) =
                    split_filename_candidates(&row.1, &is_known)
                {
                    let mut known_pairs = Vec::new();
                    let mut unknown = Vec::new();
                    for c in &cands {
                        match known.get(c) {
                            Some(id) => known_pairs.push((c.clone(), id.clone())),
                            None => {
                                if !unknown.contains(c) {
                                    unknown.push(c.clone());
                                }
                            }
                        }
                    }
                    out.push(FilenameItem {
                        scene_id: row.0,
                        file_name: row.1,
                        title_fix: title,
                        date_fix: date,
                        title_tail: tail,
                        candidates: cands,
                        known: known_pairs,
                        unknown,
                        verified: Vec::new(),
                    });
                }
            }
        }
    }
    out
}

async fn backfill_plan(
    client: &reqwest::Client,
    state: &AppState,
    include_existing: bool,
) -> Vec<BackfillItem> {
    let (missing, photos): (Vec<(String, Vec<i64>)>, Vec<(String, String)>) = {
        let conn = state.db.lock().unwrap();
        let m = missing_performer_names(&conn);
        let p = if include_existing {
            photo_needs(&conn, &state.performers_path)
        } else {
            Vec::new()
        };
        (m, p)
    };
    let mut plan = Vec::new();
    for (name, scenes) in missing {
        let slug = slugify(&name);
        let url = model_url(&slug);
        let (verified, avatar) = fetch_model(client, &name, &url).await;
        plan.push(BackfillItem {
            name, slug, url, scenes, verified,
            kind: "link".to_string(), avatar_url: avatar,
        });
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
    for (name, slug) in photos {
        // Skip names already covered above as new rows.
        if plan.iter().any(|p| p.slug == slug) {
            continue;
        }
        let url = model_url(&slug);
        let (verified, avatar) = fetch_model(client, &name, &url).await;
        plan.push(BackfillItem {
            name, slug, url, scenes: Vec::new(), verified,
            kind: "photo".to_string(), avatar_url: avatar,
        });
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
    plan
}

/// Filename phase of the plan: split candidates, then verify the unknown
/// names against their model pages (known names need no fetch).
async fn filename_plan(client: &reqwest::Client, state: &AppState) -> Vec<FilenameItem> {
    let mut items: Vec<FilenameItem> = {
        let conn = state.db.lock().unwrap();
        filename_items(&conn)
    };
    for item in &mut items {
        for name in item.unknown.clone() {
            let slug = slugify(&name);
            let (verified, _) = fetch_model(client, &name, &model_url(&slug)).await;
            if verified {
                item.verified.push(name);
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
        // Extension: fetch verdicts for leading title-tail heads, then fold
        // the verified ones into the candidates (keeps >= 1 title segment).
        while item.title_tail.len() > 1 {
            let head = item.title_tail[0].clone();
            let decided = item.known.iter().any(|(n, _)| n == &head)
                || item.verified.contains(&head)
                || item.unknown.contains(&head);
            if !decided {
                let slug = slugify(&head);
                let (verified, _) = fetch_model(client, &head, &model_url(&slug)).await;
                item.unknown.push(head.clone());
                if verified {
                    item.verified.push(head);
                } else {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            } else {
                break; // extend_candidates moves decided heads without fetching
            }
        }
        {
            let known_names: Vec<String> =
                item.known.iter().map(|(n, _)| n.clone()).collect();
            let verified_now = item.verified.clone();
            let is_p = |s: &str| {
                known_names.iter().any(|n| n == s) || verified_now.iter().any(|v| v == s)
            };
            let (title, cands) = extend_candidates(
                item.candidates.clone(),
                item.title_tail.clone(),
                &is_p,
            );
            item.title_fix = title;
            item.candidates = cands;
            item.unknown.retain(|u| item.candidates.contains(u));
            item.verified.retain(|v| item.candidates.contains(v));
            item.known.retain(|(n, _)| item.candidates.contains(n));
        }
    }
    items
}

async fn fetch_model(client: &reqwest::Client, name: &str, url: &str) -> (bool, Option<String>) {
    match client.get(url).send().await {
        Ok(resp) => match resp.text().await {
            Ok(html) => {
                if !verify_model_page(name, &html) {
                    return (false, None);
                }
                (true, parse_model_avatar(&html, name))
            }
            Err(_) => (false, None),
        },
        Err(_) => (false, None),
    }
}

pub async fn backfill_performers(
    State(state): State<AppState>,
    Json(req): Json<BackfillRequest>,
) -> Json<serde_json::Value> {
    let dry = req.dry_run.unwrap_or(true);
    let client = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(30))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => return Json(serde_json::json!({ "error": format!("http client: {e}") })),
    };
    if dry {
        let include_existing = req.existing.unwrap_or(false);
        let include_filenames = req.filenames.unwrap_or(false);
        let plan = backfill_plan(&client, &state, include_existing).await;
        let linked: usize = plan
            .iter()
            .filter(|p| p.verified && p.kind == "link")
            .map(|p| p.scenes.len())
            .sum();
        let mut resp = serde_json::json!({
            "dry_run": true,
            "missing_names": plan.iter().filter(|p| p.kind == "link").count(),
            "verifiable": plan.iter().filter(|p| p.verified && p.kind == "link").count(),
            "scenes_would_link": linked,
            "photos_missing": plan.iter().filter(|p| p.kind == "photo").count(),
            "photos_available": plan.iter().filter(|p| p.kind == "photo" && p.verified && p.avatar_url.is_some()).count(),
            "plan": plan,
        });
        if include_filenames {
            let fplan = filename_plan(&client, &state).await;
            resp["filename_scenes"] = serde_json::json!(fplan.len());
            resp["filename_links"] = serde_json::json!(
                fplan.iter().map(|f| f.known.len() + f.verified.len()).sum::<usize>()
            );
            resp["filename_plan"] = serde_json::json!(fplan);
        }
        return Json(resp);
    }
    let job_id = format!("backfill-{}", now_iso().replace([':', '.', '+'], ""));
    {
        let mut jobs = state.fetch_jobs.lock().unwrap();
        if jobs.values().any(|j| j.state == "queued" || j.state == "downloading") {
            return Json(serde_json::json!({ "error": "another fetch/backfill job is already running" }));
        }
        jobs.insert(
            job_id.clone(),
            FetchJob {
                job_id: job_id.clone(),
                url: "backfill-performers".to_string(),
                state: "queued".to_string(),
                updated_at: now_iso(),
                ..Default::default()
            },
        );
    }
    let st = state.clone();
    let spawn_id = job_id.clone();
    let include_existing = req.existing.unwrap_or(false);
    let include_filenames = req.filenames.unwrap_or(false);
    tokio::spawn(async move {
        let res = run_backfill(&st, &spawn_id, include_existing, include_filenames).await;
        match res {
            Ok(msg) => set_job(&st, &spawn_id, |j| {
                j.state = "done".to_string();
                j.message = Some(msg);
            }),
            Err(e) => set_job(&st, &spawn_id, |j| {
                j.state = "error".to_string();
                j.message = Some(e);
            }),
        }
    });
    Json(serde_json::json!({ "job_id": job_id }))
}

async fn run_backfill(
    state: &AppState,
    job_id: &str,
    include_existing: bool,
    include_filenames: bool,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    set_job(state, job_id, |j| j.state = "downloading".to_string());
    let plan = backfill_plan(&client, state, include_existing).await;
    let mut new_performers = 0i64;
    let mut linked_scenes = 0i64;
    let mut photos = 0i64;
    let mut skipped = 0usize;
    // Create the performers dir if the library lacks it.
    std::fs::create_dir_all(&state.performers_path).ok();
    for item in &plan {
        set_job(state, job_id, |j| {
            j.title = Some(format!("checking {}", item.name));
        });
        if !item.verified {
            skipped += 1;
            continue;
        }
        // Photo first (shared by both kinds): download avatar if the page had one.
        let mut photo_saved = false;
        if let Some(avatar) = item.avatar_url.as_deref() {
            let dest = state.performers_path.join(format!("{}.jpg", item.slug));
            let needs = !dest.exists()
                || std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0) == 0;
            if needs {
                match client.get(avatar).send().await {
                    Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                        Ok(bytes) if bytes.len() > 5_000 => {
                            if tokio::fs::write(&dest, &bytes).await.is_ok() {
                                photo_saved = true;
                            }
                        }
                        _ => {}
                    },
                    _ => {}
                }
                // Avatar hosts are the same site: keep the same politeness gap.
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            } else {
                photo_saved = true; // already on disk
            }
        }
        if item.kind == "photo" {
            if photo_saved {
                let image_url = format!("performers/{}.jpg", item.slug);
                let conn = state.db.lock().unwrap();
                conn.execute(
                    "UPDATE performers SET image_url=?1, source_url=?2 WHERE id=?3",
                    rusqlite::params![image_url, item.url, item.slug],
                )
                .ok();
                photos += 1;
            } else {
                skipped += 1;
            }
            continue;
        }
        {
            let conn = state.db.lock().unwrap();
            let inserted: i64 = conn
                .execute(
                    "INSERT OR IGNORE INTO performers (id, name, slug, source_url) VALUES (?1,?2,?3,?4)",
                    rusqlite::params![item.slug, item.name, item.slug, item.url],
                )
                .unwrap_or(0) as i64;
            new_performers += inserted;
            if photo_saved {
                let image_url = format!("performers/{}.jpg", item.slug);
                conn.execute(
                    "UPDATE performers SET image_url=?1 WHERE id=?2",
                    rusqlite::params![image_url, item.slug],
                )
                .ok();
            }
            for sid in &item.scenes {
                let cur: String = conn
                    .query_row(
                        "SELECT performer_ids FROM scenes WHERE id=?1",
                        [sid],
                        |r| r.get(0),
                    )
                    .unwrap_or_else(|_| "[]".to_string());
                let merged = merge_ids(&cur, &[item.slug.clone()]);
                if merged != cur {
                    conn.execute(
                        "UPDATE scenes SET performer_ids=?1 WHERE id=?2",
                        rusqlite::params![merged, sid],
                    )
                    .ok();
                    linked_scenes += 1;
                }
            }
        }
    }
    // Filenames phase: adopt titles/dates from descriptive names and link
    // known performers immediately; verified newcomers get rows too.
    let mut filename_links = 0i64;
    let mut filename_scenes = 0i64;
    if include_filenames {
        let fplan = filename_plan(&client, state).await;
        for item in &fplan {
            set_job(state, job_id, |j| {
                j.title = Some(format!("filenames: {}", item.file_name));
            });
            // Collect ids: known ones directly, verified newcomers after insert.
            // Display names follow candidate order for the UI.
            let mut ids: Vec<String> = item.known.iter().map(|(_, id)| id.clone()).collect();
            let mut display: Vec<String> =
                item.known.iter().map(|(n, _)| n.clone()).collect();
            {
                let conn = state.db.lock().unwrap();
                for name in &item.verified {
                    let slug = slugify(name);
                    conn.execute(
                        "INSERT OR IGNORE INTO performers (id, name, slug, source_url) VALUES (?1,?2,?3,?4)",
                        rusqlite::params![slug, name, slug, model_url(&slug)],
                    )
                    .ok();
                    new_performers += 1;
                    if !ids.iter().any(|x| x == &slug) {
                        ids.push(slug);
                    }
                    if !display.iter().any(|x| x == name) {
                        display.push(name.clone());
                    }
                }
            }
            if ids.is_empty() {
                skipped += 1;
                continue;
            }
            {
                let conn = state.db.lock().unwrap();
                let row: Option<(String, String, String, String)> = conn
                    .query_row(
                        "SELECT title, date, performer_ids, performers FROM scenes WHERE id=?1",
                        [item.scene_id],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                    )
                    .ok();
                if let Some((title, date, cur, cur_display)) = row {
                    // Overwrite placeholder titles: empty, the raw stem, or
                    // the date-stripped core the scanner stores. Anything
                    // else is treated as intentional (manual edit) and kept.
                    let stem = item
                        .file_name
                        .rsplit_once('.')
                        .map(|(s, _)| s.to_string())
                        .unwrap_or_else(|| item.file_name.clone());
                    let core = strip_date_suffix(&stem);
                    if title.trim().is_empty() || title == stem || title == core {
                        conn.execute(
                            "UPDATE scenes SET title=?1 WHERE id=?2",
                            rusqlite::params![item.title_fix, item.scene_id],
                        )
                        .ok();
                    }
                    if date.trim().is_empty() && !item.date_fix.is_empty() {
                        conn.execute(
                            "UPDATE scenes SET date=?1 WHERE id=?2",
                            rusqlite::params![item.date_fix, item.scene_id],
                        )
                        .ok();
                    }
                    let merged = merge_ids(&cur, &ids);
                    if merged != cur {
                        conn.execute(
                            "UPDATE scenes SET performer_ids=?1 WHERE id=?2",
                            rusqlite::params![merged, item.scene_id],
                        )
                        .ok();
                        linked_scenes += 1;
                    }
                    // Fill blank display arrays so the UI shows names
                    // (forward truth stays in performer_ids either way).
                    let blank = cur_display.trim().is_empty()
                        || cur_display.trim() == "[]"
                        || cur_display.trim() == "null";
                    if blank && !display.is_empty() {
                        conn.execute(
                            "UPDATE scenes SET performers=?1 WHERE id=?2",
                            rusqlite::params![
                                serde_json::to_string(&display)
                                    .unwrap_or_else(|_| "[]".to_string()),
                                item.scene_id
                            ],
                        )
                        .ok();
                    }
                    filename_links += ids.len() as i64;
                    filename_scenes += 1;
                }
            }
        }
    }
    Ok(format!(
        "backfill complete: {} new performer(s), {} scene link(s), {} photo(s), {} filename scene(s) / {} links, {} skipped",
        new_performers, linked_scenes, photos, filename_scenes, filename_links, skipped
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"
<html><head><title>[Babes.com] - Indian Summer | Free FULL Video!</title>
<meta name="keywords" content="Blonde, Natural Tits, India Summer, Ryan Driller"></head>
<body>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"VideoObject",
"name":"Babes.com - India SummerRyan Driller - Indian Summer",
"uploadDate":"2013-02-25T00:00:00Z","duration":"PT0H18M31S",
"thumbnailUrl":"https://www.freepornvideos.xxx/contents/x/preview_480m.mp4.jpg"}
</script>
<a href="/models/india-summer/">India Summer</a>
<a href="/models/ryan-driller/">Ryan Driller</a>
<a href="/sites/babescom/">Babes.com</a>
<a href="https://www.freepornvideos.xxx/get_file/8512/aaa/93665000/93665510/93665510_480m.mp4/">dl</a>
<a href="https://www.freepornvideos.xxx/get_file/8512/bbb/93665000/93665510/93665510_720m.mp4/">dl</a>
</body></html>"#;

    #[test]
    fn parses_page_details() {
        let d = parse_video_page("93665510", FIXTURE, "480m").expect("parse");
        assert_eq!(d.studio, "Babes.com");
        assert_eq!(d.title, "Indian Summer");
        assert_eq!(d.performers, vec!["India Summer", "Ryan Driller"]);
        assert_eq!(d.date_iso, "2013-02-25");
        assert_eq!(d.date_file, "25.02.2013");
        assert_eq!(d.dur_sec, 18 * 60 + 31);
        assert!(d.file_url.contains("93665510_480m.mp4"));
        assert_eq!(d.file_res, "480m");
        assert_eq!(
            display_filename(&d),
            "India Summer - Ryan Driller - Indian Summer  25.02.2013_480m.mp4"
        );
        assert_eq!(d.tags, vec!["Blonde", "Natural Tits"]);
    }

    #[test]
    fn falls_back_to_other_resolution() {
        let d = parse_video_page("93665510", FIXTURE, "1080p").expect("parse");
        assert_eq!(d.file_res, "480m");
    }

    #[test]
    fn rejects_blocked_page() {
        assert!(parse_video_page("1", "Sorry, the website is temporary unavailable.", "480m").is_err());
    }

    #[test]
    fn validates_urls() {
        assert!(parse_video_url("https://www.freepornvideos.xxx/videos/93665510/indian-summer/").1);
        assert!(!parse_video_url("https://evil.example/videos/1/x/").1);
        assert!(!parse_video_url("https://www.freepornvideos.xxx/search/x/").1);
        assert!(!parse_video_url("not a url").1);
    }

    #[test]
    fn slug_and_filename_helpers() {
        assert_eq!(slugify("Mommy's Girl"), "mommys-girl");
        assert_eq!(slugify("BLACKED RAW"), "blacked-raw");
        assert_eq!(sanitize_filename("A<B>C:D\"E/F\\G|H?I*J. "), "ABCDEFGHIJ");
    }

    #[test]
    fn duration_parser() {
        assert_eq!(parse_iso_duration("PT0H22M37S"), 22 * 60 + 37);
        assert_eq!(parse_iso_duration("PT33M37S"), 33 * 60 + 37);
        assert_eq!(parse_iso_duration("PT56S"), 56);
    }

    #[test]
    fn model_page_verification() {
        let html = "<html><head><title>Kira Noir - x</title></head><body><h1>Kira Noir's Videos</h1>xxxx padding xxxx xxxx</body></html>";
        assert!(verify_model_page("Kira Noir", &format!("{html}<!--{}-->", "p".repeat(6000))));
        assert!(!verify_model_page("Jane Wilde", &format!("{html}<!--{}-->", "p".repeat(6000))));
        assert!(!verify_model_page("Kira Noir", "Sorry, the website is temporary unavailable."));
    }

    #[test]
    fn id_merge_dedupes() {
        assert_eq!(
            merge_ids("[\"a\"]", &["b".to_string(), "a".to_string()]),
            "[\"a\",\"b\"]"
        );
        assert_eq!(merge_ids("not-json", &["x".to_string()]), "[\"x\"]");
        assert_eq!(
            model_url("kira-noir"),
            "https://www.freepornvideos.xxx/models/kira-noir/"
        );
    }

    #[test]
    fn avatar_parsing_prefers_name_match() {
        let html = r#"<img loading="lazy" class="thumb" src="https://www.freepornvideos.xxx/contents/models/1100/s1_angela_white.jpg" alt="Angela White"><img src="https://img.freepornvideos.xxx/93679000/x.jpg" alt="scene">"#;
        assert_eq!(
            parse_model_avatar(html, "Angela White"),
            Some("https://www.freepornvideos.xxx/contents/models/1100/s1_angela_white.jpg".to_string())
        );
        assert_eq!(parse_model_avatar("<html>no images</html>", "Nobody"), None);
    }

    #[test]
    fn filename_splitter_long_form() {
        let none = |_: &str| false;
        let r = split_filename_candidates(
            "Marica Hase - Alexis Tae - Intimate Worship  25.04.2022_480m.mp4",
            &none,
        )
        .expect("split");
        assert_eq!(r.0, "Intimate Worship");
        assert_eq!(r.1, "2022-04-25");
        assert_eq!(r.2, vec!["Marica Hase", "Alexis Tae"]);
        assert!(r.3.is_empty());
    }

    #[test]
    fn filename_splitter_short_form() {
        let none = |_: &str| false;
        let r = split_filename_candidates(
            "Sugar Daddy Anal Tryouts - Lena Paul, Sarah Vandella, Christian Clay.mp4",
            &none,
        )
        .expect("split");
        assert_eq!(r.0, "Sugar Daddy Anal Tryouts");
        assert_eq!(r.1, "");
        assert_eq!(r.2, vec!["Lena Paul", "Sarah Vandella", "Christian Clay"]);
    }

    #[test]
    fn filename_splitter_anchored_title_tail() {
        // "Scarlit Scandal" anchors the boundary; the tail waits for extension.
        let known = |s: &str| s.eq_ignore_ascii_case("Scarlit Scandal");
        let r = split_filename_candidates(
            "Alex Blake - Scarlit Scandal - LesbianX Homemade - Scarlit Scandal & Alex Blake  25.07.2020_480m.mp4",
            &known,
        )
        .expect("split");
        assert_eq!(r.0, "");
        assert_eq!(r.2, vec!["Alex Blake", "Scarlit Scandal"]);
        assert_eq!(r.3, vec!["LesbianX Homemade", "Scarlit Scandal & Alex Blake"]);
        // Extension folds nothing when unverified, keeping the full tail.
        let nobody = |_: &str| false;
        let (title, cands) = extend_candidates(r.2, r.3, &nobody);
        assert_eq!(title, "LesbianX Homemade - Scarlit Scandal & Alex Blake");
        assert!(cands.is_empty() || cands == vec!["Alex Blake", "Scarlit Scandal"]);
    }

    #[test]
    fn date_suffix_stripping() {
        assert_eq!(
            strip_date_suffix("P1 - Title  25.04.2022_480m"),
            "P1 - Title"
        );
        assert_eq!(strip_date_suffix("Title - P1, P2"), "Title - P1, P2");
        assert_eq!(strip_date_suffix("NoDateStamp"), "NoDateStamp");
    }

    #[test]
    fn filename_extension_moves_verified() {
        // Marykate Moss verifies → joins candidates, title stays clean.
        let ok = |s: &str| s == "Emily Willis" || s == "Marykate Moss";
        let (title, cands) = extend_candidates(
            vec!["Emily Willis".to_string()],
            vec!["Marykate Moss".to_string(), "Reconnecting".to_string()],
            &ok,
        );
        assert_eq!(title, "Reconnecting");
        assert_eq!(cands, vec!["Emily Willis", "Marykate Moss"]);
        // Nothing verified → tail untouched.
        let no = |s: &str| s == "Emily Willis";
        let (title, cands) = extend_candidates(
            vec!["Emily Willis".to_string()],
            vec!["Marykate Moss".to_string(), "Reconnecting".to_string()],
            &no,
        );
        assert_eq!(title, "Marykate Moss - Reconnecting");
        assert_eq!(cands, vec!["Emily Willis"]);
    }

    #[test]
    fn filename_splitter_rejects_bare_names() {
        let none = |_: &str| false;
        assert!(split_filename_candidates("index (1).mp4", &none).is_none());
        assert!(split_filename_candidates("1845712.mp4", &none).is_none());
        assert!(split_filename_candidates("Unknown (1411782).mp4", &none).is_none());
    }
}
