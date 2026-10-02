use crate::api::{now_iso, resolve_video_path};
use crate::db::{meta_set, Db};
use crate::state::AppState;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Instant;

const VIDEO_EXTS: &[&str] = &["mp4", "webm", "mkv", "mov", "avi", "m4v", "wmv", "flv", "ts"];

#[derive(Serialize, Default)]
pub struct ScanResult {
    pub files: usize,
    pub new: usize,
    pub updated: usize,
    pub missing: usize,
    /// Existing scenes re-attached to a file by id prefix.
    pub adopted: usize,
    /// Placeholders created USING the file's numeric prefix as the scene id.
    pub created: usize,
    /// Files skipped: prefix already claimed or points at a live scene.
    pub conflicts: usize,
    /// Files with no usable prefix (legacy AUTOINCREMENT placeholder).
    pub unresolved: usize,
    /// Performer links established from filename credits (exact matches).
    pub performer_links: usize,
    /// Studios created from filename/folder names during this scan.
    pub new_studios: Vec<String>,
    /// Performer-looking filename tokens with no matching performer row
    /// (stored display-only; create the performer + re-scan or PATCH to link).
    pub unknown_performers: Vec<String>,
    pub conflict_files: Vec<String>,
    pub bytes: u64,
    pub duration_ms: u64,
    pub last_scan: Option<String>,
}

/// Walk the library and reconcile `scenes` with what's actually on disk:
/// update file stats, adopt/link existing scenes by id prefix, create
/// placeholders (using the filename prefix as the scene id when possible),
/// and flag scenes whose file has disappeared.
///
/// Identity rule (MAPPING_INVARIANTS.md §3): one prefix → one logical scene.
/// A numeric prefix (≥5 leading digits) either identifies an existing scene
/// or becomes the new scene's id — never an AUTOINCREMENT orphan. Files that
/// would violate that (prefix already claimed this scan, or the scene already
/// has a live file) are counted as conflicts and left untouched for review.
pub fn scan_library(db: &Db, library_path: &Path) -> ScanResult {
    let started = Instant::now();
    let mut res = ScanResult::default();

    let files = collect_videos(library_path);
    let conn = db.lock().unwrap();
    let by_name = load_by_name(&conn);
    let mut seen: HashSet<i64> = HashSet::new();
    let mut claimed: HashSet<String> = HashSet::new();

    let mut stmt_upd = conn
        .prepare(
            "UPDATE scenes SET file_exists=1, size_bytes=?1, mtime=?2, file_path=?3
             WHERE id=?4",
        )
        .expect("prepare update");
    let mut stmt_ins = conn
        .prepare(
            "INSERT INTO scenes(file_name, original_name, title, file_path, resolution,
                                studio, studio_id, date, performers, performer_ids, category_ids,
                                file_exists, size_bytes, mtime)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?13)",
        )
        .expect("prepare insert");
    let mut stmt_ins_id = conn
        .prepare(
            "INSERT INTO scenes(id, file_name, original_name, title, file_path, resolution,
                                studio, studio_id, date, performers, performer_ids, category_ids,
                                file_exists, size_bytes, mtime)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?14)",
        )
        .expect("prepare insert with id");
    let mut unknown_set: std::collections::HashSet<String> = std::collections::HashSet::new();

    for f in &files {
        res.files += 1;
        res.bytes += f.size;
        let key = f.name.to_lowercase();
        let id = by_name
            .get(&key)
            .and_then(|(id, _)| Some(*id))
            .or_else(|| by_path(&conn, &f.stored).or_else(|| by_path(&conn, &f.rel)));

        match id {
            Some(id) => {
                stmt_upd
                    .execute(rusqlite::params![f.size, f.mtime, f.stored, id])
                    .ok();
                seen.insert(id);
                res.updated += 1;
            }
            None => {
                let prefix = id_prefix(&f.name);
                if let Some(id) = link_by_prefix(&conn, library_path, f) {
                    stmt_upd
                        .execute(rusqlite::params![f.size, f.mtime, f.stored, id])
                        .ok();
                    seen.insert(id);
                    res.updated += 1;
                    res.adopted += 1;
                    if let Some(p) = prefix {
                        claimed.insert(p);
                    }
                } else if let Some(p) = prefix {
                    if claimed.contains(&p) {
                        res.conflict("claimed", &p, &f.name);
                    } else if let Some(pid) = p.parse::<i64>().ok() {
                        match prefix_scene_status(&conn, library_path, pid) {
                            // Scene exists and already has a live file:
                            // do NOT steal it — review_required.
                            Some(true) => {
                                claimed.insert(p.clone());
                                res.conflict("live-scene", &p, &f.name);
                            }
                            // Exists but file missing (defensive; link_by_prefix
                            // normally catches this first).
                            Some(false) => {
                                stmt_upd
                                    .execute(rusqlite::params![f.size, f.mtime, f.stored, pid])
                                    .ok();
                                seen.insert(pid);
                                claimed.insert(p);
                                res.updated += 1;
                                res.adopted += 1;
                            }
                            // No scene with this id: create USING the prefix.
                            // Filename credits (studio/performers/title/date) are parsed here.
                            None => {
                                let meta = build_new_meta(&conn, f);
                                let resolution = if meta.resolution.is_empty() {
                                    detect_resolution(&f.name)
                                } else {
                                    meta.resolution
                                };
                                stmt_ins_id
                                    .execute(rusqlite::params![
                                        pid,
                                        f.name,
                                        f.stem,
                                        meta.title,
                                        f.stored,
                                        resolution,
                                        meta.studio,
                                        meta.studio_id,
                                        meta.date,
                                        meta.performers_json,
                                        meta.performer_ids_json,
                                        meta.category_ids_json,
                                        f.size,
                                        f.mtime,
                                    ])
                                    .ok();
                                res.performer_links += meta.link_count;
                                if let Some(s) = meta.studio_created {
                                    if !res.new_studios.contains(&s) {
                                        res.new_studios.push(s);
                                    }
                                }
                                for u in meta.unknown_names {
                                    unknown_set.insert(u);
                                }
                                claimed.insert(p);
                                res.new += 1;
                                res.created += 1;
                            }
                        }
                    } else {
                        legacy_placeholder(&mut stmt_ins, &conn, f, &mut res, &mut unknown_set);
                    }
                } else {
                    legacy_placeholder(&mut stmt_ins, &conn, f, &mut res, &mut unknown_set);
                }
            }
        }
    }

    res.missing = mark_missing(&conn, library_path, &seen);

    let mut unknowns: Vec<String> = unknown_set.into_iter().collect();
    unknowns.sort();
    unknowns.truncate(50);
    res.unknown_performers = unknowns;

    drop(stmt_upd);
    drop(stmt_ins);
    drop(stmt_ins_id);

    let now = now_iso();
    drop(conn);
    meta_set(db, "last_scan", &now);
    res.last_scan = Some(now);
    res.duration_ms = started.elapsed().as_millis() as u64;
    res
}

impl ScanResult {
    fn conflict(&mut self, _kind: &str, prefix: &str, file: &str) {
        self.conflicts += 1;
        if self.conflict_files.len() < 10 {
            self.conflict_files.push(format!("{prefix}: {file}"));
        }
    }
}

fn legacy_placeholder(
    stmt_ins: &mut rusqlite::Statement,
    conn: &Connection,
    f: &VideoFile,
    res: &mut ScanResult,
    unknown_set: &mut std::collections::HashSet<String>,
) {
    // Descriptive filenames carry their own credits (studio/performers/title).
    // Performers link ONLY on exact match to an existing performer row;
    // unknown names stay display-only and are reported for review.
    let meta = build_new_meta(conn, f);
    let resolution = if meta.resolution.is_empty() {
        detect_resolution(&f.name)
    } else {
        meta.resolution
    };
    stmt_ins
        .execute(rusqlite::params![
            f.name,
            f.stem,
            meta.title,
            f.stored,
            resolution,
            meta.studio,
            meta.studio_id,
            meta.date,
            meta.performers_json,
            meta.performer_ids_json,
            meta.category_ids_json,
            f.size,
            f.mtime,
        ])
        .ok();
    res.performer_links += meta.link_count;
    if let Some(s) = meta.studio_created {
        if !res.new_studios.contains(&s) {
            res.new_studios.push(s);
        }
    }
    for u in meta.unknown_names {
        unknown_set.insert(u);
    }
    res.new += 1;
    res.unresolved += 1;
}

/// Leading numeric run of a filename (≥5 digits) — the scene-id convention.
/// Returns None when the name carries no usable prefix.
fn id_prefix(name: &str) -> Option<String> {
    let digits: String = name.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.len() >= 5 {
        Some(digits)
    } else {
        None
    }
}

/// Does a scene row with this id exist? If so, does its file exist on disk?
/// None = no such scene. Some(true) = live scene (do not steal).
/// Some(false) = row exists but file missing (adoptable).
fn prefix_scene_status(conn: &Connection, library_path: &Path, pid: i64) -> Option<bool> {
    let fp: Option<String> = conn
        .query_row("SELECT file_path FROM scenes WHERE id=?1", [pid], |r| r.get(0))
        .ok()?;
    let present = fp
        .as_deref()
        .and_then(|p| resolve_video_path(library_path, p))
        .map(|p| p.exists())
        .unwrap_or(false);
    Some(present)
}

fn by_path(conn: &Connection, path: &str) -> Option<i64> {
    conn.query_row(
        "SELECT id FROM scenes WHERE file_path=?1 OR file_path=?2 LIMIT 1",
        rusqlite::params![path, path.replace('\\', "/")],
        |r| r.get(0),
    )
    .ok()
}

/// Many files in the library are named `<sceneId>_<res>.mp4`. When an
/// unlisted file matches a scene id prefix and that scene's file is currently
/// missing on disk, reattach the file to the existing scene instead of
/// creating a duplicate placeholder.
fn link_by_prefix(conn: &Connection, library_path: &Path, f: &VideoFile) -> Option<i64> {
    let digits: String = f.name.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.len() < 5 {
        return None;
    }
    let id: i64 = digits.parse().ok()?;
    let (_name, file): (String, Option<String>) = conn
        .query_row(
            "SELECT file_name, file_path FROM scenes WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok()?;
    if let Some(fp) = &file {
        if !fp.is_empty()
            && resolve_video_path(library_path, fp)
                .map(|p| p.exists())
                .unwrap_or(false)
        {
            return None;
        }
    }
    Some(id)
}

fn load_by_name(conn: &Connection) -> HashMap<String, (i64, String)> {
    let mut map = HashMap::new();
    let mut stmt = conn
        .prepare("SELECT id, file_name FROM scenes WHERE file_name IS NOT NULL")
        .expect("prepare by_name");
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .unwrap()
        .flatten();
    for row in rows {
        map.insert(row.1.to_lowercase(), (row.0, row.1));
    }
    map
}

fn mark_missing(conn: &Connection, library_path: &Path, seen: &HashSet<i64>) -> usize {
    let mut missing = 0;
    let mut stmt = conn
        .prepare("SELECT id, file_path FROM scenes WHERE file_path IS NOT NULL AND file_path != ''")
        .expect("prepare missing");
    let q = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .expect("query missing");
    let mut rows = Vec::new();
    for row in q {
        if let Ok(pair) = row {
            rows.push(pair);
        }
    }
    for (id, path) in rows {
        let abs = resolve_video_path(library_path, &path);
        if abs.map(|p| p.exists()).unwrap_or(false) {
            if !seen.contains(&id) {
                conn.execute("UPDATE scenes SET file_exists=1 WHERE id=?1", [id])
                    .ok();
            }
        } else {
            conn.execute("UPDATE scenes SET file_exists=0 WHERE id=?1", [id])
                .ok();
            missing += 1;
        }
    }
    missing
}

pub(crate) struct VideoFile {
    pub(crate) name: String,
    pub(crate) stem: String,
    pub(crate) rel: String,
    pub(crate) stored: String,
    pub(crate) parent: String,
    pub(crate) size: u64,
    pub(crate) mtime: f64,
}

pub(crate) fn collect_videos(library_path: &Path) -> Vec<VideoFile> {
    let mut out = Vec::new();
    let lib_name = library_path.file_name().map(|s| s.to_string_lossy().into_owned());
    let mut stack = vec![library_path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name == "netflix-app" || name == ".git" || name.starts_with('.') {
                    continue;
                }
                stack.push(path);
            } else if ft.is_file() && is_video(&path) {
                let Ok(meta) = std::fs::metadata(&path) else { continue };
                let name = entry.file_name().to_string_lossy().into_owned();
                let stem = name
                    .rsplit_once('.')
                    .map(|(s, _)| s.to_string())
                    .unwrap_or_else(|| name.clone());
                let rel = path
                    .strip_prefix(library_path)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| name.clone());
                let stored = match &lib_name {
                    Some(n) => format!("{n}/{rel}"),
                    None => rel.clone(),
                };
                let parent = rel
                    .split('/')
                    .next()
                    .filter(|_p| rel.contains('/'))
                    .unwrap_or("")
                    .to_string();
                out.push(VideoFile {
                    name,
                    stem,
                    rel,
                    stored,
                    parent,
                    size: meta.len(),
                    mtime: meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs_f64())
                        .unwrap_or(0.0),
                });
            }
        }
    }
    out
}

fn is_video(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub(crate) fn detect_resolution(name: &str) -> String {
    let lower = name.to_lowercase();
    // Longer tokens first so "480m" wins over "480", "720p" over "720", etc.
    for r in [
        "2160p", "4k", "1440p", "1080p", "1080", "720p", "720m", "720", "480p", "480m",
        "480",
    ] {
        if lower.contains(r) {
            return r.to_string();
        }
    }
    String::new()
}

/// Parse descriptive (non-numeric) filenames produced by the studio-grouping:
/// - long:  "<title part>  DD.MM.YYYY_RES" (studio already stripped, folder is studio)
/// - short: "<Title> - P1, P2" (no date/res; performers stay display-only, never linked)
/// Returns (title, date_iso YYYY-MM-DD or "", resolution).
/// Performers are NEVER inferred here (MAPPING_INVARIANTS.md §3).
pub(crate) fn parse_descriptive(stem: &str) -> (String, String, String) {
    // Long form: trailing double-space + date + "_" + res
    if let Some((head, tail)) = stem.rsplit_once("  ") {
        let t: Vec<&str> = tail.split('_').collect();
        if t.len() == 2 && t[0].len() == 10 {
            let d: Vec<&str> = t[0].split('.').collect();
            if d.len() == 3
                && d[0].len() == 2
                && d[1].len() == 2
                && d[2].len() == 4
                && d.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
                // Range-check: without this, "Show  99.99.2022_480" would
                // become a fake ISO date. Non-dates fall through to plain title.
                && (1..=31).contains(&d[0].parse().unwrap_or(0))
                && (1..=12).contains(&d[1].parse().unwrap_or(0))
            {
                let res = detect_resolution(t[1]);
                let res = if res.is_empty() { t[1].to_string() } else { res };
                return (
                    head.trim().to_string(),
                    format!("{}-{}-{}", d[2], d[1], d[0]),
                    res,
                );
            }
        }
    }
    // Short form or fallback: keep the stem as title (strip a trailing _RES if present).
    let (base, res) = match stem.rsplit_once('_') {
        Some((b, r)) if !detect_resolution(r).is_empty() && !b.is_empty() => {
            (b.to_string(), detect_resolution(r))
        }
        _ => (stem.to_string(), detect_resolution(stem)),
    };
    (base, String::new(), res)
}

/// Studio inference from the parent folder: allowed ONLY on exact
/// case-insensitive match to one studio id/name (MAPPING_INVARIANTS.md §3).
/// Returns (canonical_id, canonical_name) or None.
fn lookup_studio(conn: &Connection, parent: &str) -> Option<(String, String)> {
    if parent.is_empty() {
        return None;
    }
    conn.query_row(
        "SELECT id, name FROM studios WHERE lower(id)=lower(?1) OR lower(name)=lower(?1) LIMIT 1",
        [parent],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
    )
    .ok()
}

/// Canonical slug for studio ids: lowercase, apostrophes dropped,
/// runs of non-alphanumerics collapsed to one `-`.
/// "Mommy's Girl" → "mommys-girl", "Babes.com" → "babes-com".
fn slugify_id(name: &str) -> String {
    let lower = name.to_lowercase().replace('\'', "").replace('’', "");
    let mut out = String::new();
    let mut dashed = false;
    for c in lower.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            dashed = false;
        } else if !out.is_empty() && !dashed {
            out.push('-');
            dashed = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

/// Resolve a studio candidate (filename head or folder name) to
/// (display_name, studio_id):
/// exact match → punctuation-insensitive slug match → create new row.
/// Creating (never mis-linking) keeps `studio_missing` orphans from
/// accumulating when new studios arrive with new files.
fn resolve_studio(conn: &Connection, candidate: &str) -> (String, String, Option<String>) {
    let cand = candidate.trim();
    if cand.is_empty() {
        return (String::new(), String::new(), None);
    }
    if let Some((id, name)) = lookup_studio(conn, cand) {
        return (name, id, None);
    }
    let want = slugify_id(cand);
    if want.is_empty() {
        return (cand.to_string(), String::new(), None);
    }
    if let Ok(mut stmt) = conn.prepare("SELECT id, name FROM studios") {
        if let Ok(rows) =
            stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)))
        {
            for row in rows.flatten() {
                let name_slug = row.1.as_deref().map(slugify_id).unwrap_or_default();
                if slugify_id(&row.0) == want || name_slug == want {
                    return (row.1.unwrap_or(row.0.clone()), row.0, None);
                }
            }
        }
    }
    let mut id = want;
    let mut n = 2;
    while conn
        .query_row("SELECT 1 FROM studios WHERE id=?1", params![id], |_| Ok(()))
        .is_ok()
    {
        id = format!("{}-{n}", slugify_id(cand));
        n += 1;
    }
    let name = cand.to_string();
    match conn.execute(
        "INSERT OR IGNORE INTO studios(id, name) VALUES(?1, ?2)",
        params![id, name],
    ) {
        Ok(_) => (name.clone(), id.clone(), Some(name)),
        Err(_) => (name, String::new(), None),
    }
}

/// Exact (case-insensitive) performer lookup by display name or id.
/// Returns (canonical_id, canonical_name). Unknown names are NEVER
/// auto-created here — callers keep them display-only (MAPPING_INVARIANTS §2.2).
fn lookup_performer(conn: &Connection, name: &str) -> Option<(String, String)> {
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    conn.query_row(
        "SELECT id, name FROM performers WHERE lower(name)=lower(?1) OR lower(id)=lower(?1) LIMIT 1",
        [name],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
    )
    .ok()
    .map(|(id, n)| (id.clone(), n.unwrap_or(id)))
}

/// True when a filename segment trails a date like "  25.04.2022_480m".
fn has_date_tail(segment: &str) -> bool {
    let Some((_, tail)) = segment.rsplit_once("  ") else {
        return false;
    };
    let date = tail.split('_').next().unwrap_or("");
    let p: Vec<&str> = date.split('.').collect();
    p.len() == 3
        && p[0].len() == 2
        && p[1].len() == 2
        && p[2].len() == 4
        && p.iter().all(|x| x.chars().all(|c| c.is_ascii_digit()))
}

/// Split a video stem into (studio_candidate, performer_candidates, title_blob).
/// - Root files (`parent == ""`): "<Studio> - <P1> - ... - <Title>  date_res".
/// - Folder files: studio comes from the folder; "<P1> - ... - <Title>  date_res".
/// - Short form (either): "<Title> - P1, P2" — comma list, never a studio.
/// Titles containing " - " surface their extra segments as performer
/// candidates; the caller folds title-like ones back into the title.
/// Two-part root names ("A - B") are disambiguated against the DB: known
/// studio → studio; known performer head → credits; dated B → studio-first
/// convention; otherwise the whole stem stays the title (no bogus studio).
fn split_filename_credits(
    conn: &Connection,
    stem: &str,
    parent: &str,
) -> (Option<String>, Vec<String>, String) {
    let stem = stem.trim();
    if !stem.contains(" - ") {
        return (None, vec![], stem.to_string());
    }
    let parts: Vec<String> = stem
        .split(" - ")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.len() < 2 {
        return (None, vec![], stem.to_string());
    }
    let last = parts.last().cloned().unwrap_or_default();
    // Short form: trailing comma list with no date ("Title - P1, P2").
    if last.contains(',') && !has_date_tail(&last) {
        let title = parts[..parts.len() - 1].join(" - ");
        let perfs = last
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        return (None, perfs, title);
    }
    if parent.is_empty() {
        if parts.len() >= 3 {
            let perfs = parts[1..parts.len() - 1].to_vec();
            return (Some(parts[0].clone()), perfs, last);
        }
        let head = parts[0].clone();
        if studio_known(conn, &head) {
            return (Some(head), vec![], last);
        }
        if lookup_performer(conn, &head).is_some() {
            return (None, vec![head], last);
        }
        if has_date_tail(&last) {
            return (Some(head), vec![], last);
        }
        return (None, vec![], stem.to_string());
    }
    let perfs = parts[..parts.len() - 1].to_vec();
    (None, perfs, last)
}

/// True when the candidate names an existing studio (exact or
/// punctuation-insensitive slug match). No writes.
fn studio_known(conn: &Connection, candidate: &str) -> bool {
    if lookup_studio(conn, candidate).is_some() {
        return true;
    }
    let want = slugify_id(candidate);
    if want.is_empty() {
        return false;
    }
    conn.prepare("SELECT id, name FROM studios")
        .map(|mut stmt| {
            stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
            })
            .map(|rows| {
                rows.flatten().any(|(id, name)| {
                    slugify_id(&id) == want
                        || name.as_deref().map(slugify_id).unwrap_or_default() == want
                })
            })
            .unwrap_or(false)
        })
        .unwrap_or(false)
}

/// Title fragments that leaked into the performer position (titles containing
/// " - ", e.g. "Lesbian Encounters - Scene 1"): digits, `#`/`!`/`?`, or more
/// than 3 words mark a title. Everything else is performer-shaped.
fn looks_like_title(token: &str) -> bool {
    if token
        .chars()
        .any(|c| c.is_ascii_digit() || c == '#' || c == '!' || c == '?')
    {
        return true;
    }
    token.split_whitespace().count() > 3
}

struct NewMeta {
    title: String,
    date: String,
    resolution: String,
    studio: String,
    studio_id: String,
    studio_created: Option<String>,
    performers_json: String,
    performer_ids_json: String,
    category_ids_json: String,
    link_count: usize,
    unknown_names: Vec<String>,
}

/// Build the full metadata for a not-yet-in-DB file: title/date/resolution
/// from the trailing blob, studio from filename head or folder (created when
/// new), performers linked on exact match (unknowns kept display-only), and
/// categories inherited from the studio signature.
fn build_new_meta(conn: &Connection, f: &VideoFile) -> NewMeta {
    let (studio_cand, perf_cands, title_blob) = split_filename_credits(conn, &f.stem, &f.parent);
    let (mut title, date, resolution) = parse_descriptive(&title_blob);
    let mut title_extra: Vec<String> = Vec::new();
    let mut name_cands: Vec<String> = Vec::new();
    for c in &perf_cands {
        for nm in c.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if looks_like_title(nm) {
                title_extra.push(nm.to_string());
            } else {
                name_cands.push(nm.to_string());
            }
        }
    }
    if !title_extra.is_empty() {
        title_extra.push(title);
        title = title_extra.join(" - ");
    }
    let folder_cand = if f.parent.is_empty() { None } else { Some(f.parent.clone()) };
    let (studio, studio_id, studio_created) = match studio_cand.or(folder_cand) {
        Some(c) => resolve_studio(conn, &c),
        None => (String::new(), String::new(), None),
    };
    let mut display: Vec<String> = Vec::new();
    let mut ids: Vec<String> = Vec::new();
    let mut unknown: Vec<String> = Vec::new();
    for nm in &name_cands {
        match lookup_performer(conn, nm) {
            Some((id, canon)) => {
                ids.push(id);
                display.push(canon);
            }
            None => {
                display.push(nm.clone());
                unknown.push(nm.clone());
            }
        }
    }
    let link_count = ids.len();
    // New scenes inherit their studio's signature categories automatically.
    let cats = crate::api::studios::studio_signature(conn, &studio_id);
    NewMeta {
        title,
        date,
        resolution,
        studio,
        studio_id,
        studio_created,
        performers_json: serde_json::to_string(&display).unwrap_or_else(|_| "[]".into()),
        performer_ids_json: serde_json::to_string(&ids).unwrap_or_else(|_| "[]".into()),
        category_ids_json: serde_json::to_string(&cats).unwrap_or_else(|_| "[]".into()),
        link_count,
        unknown_names: unknown,
    }
}

/// Compute library health stats without rescanning.
/// Includes size/mtime drift detection (DB vs filesystem), thumbnail audit,
/// and a per-studio breakdown. All bounded: ~1 stat call per scene file.
pub fn stats(state: &AppState) -> serde_json::Value {
    let conn = state.db.lock().unwrap();
    let count = |sql: &str| {
        conn.query_row(sql, [], |r| r.get::<_, i64>(0))
            .unwrap_or(0)
    };
    let total = count("SELECT COUNT(*) FROM scenes");
    let missing = count("SELECT COUNT(*) FROM scenes WHERE file_exists=0");
    let on_disk =
        count("SELECT COUNT(*) FROM scenes WHERE file_exists=1 AND file_path IS NOT NULL AND file_path != ''");
    let no_file = count("SELECT COUNT(*) FROM scenes WHERE file_path IS NULL OR file_path = ''");
    let bytes: i64 = conn
        .query_row("SELECT COALESCE(SUM(size_bytes),0) FROM scenes", [], |r| r.get(0))
        .unwrap_or(0);
    let last_scan: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key='last_scan'", [], |r| r.get(0))
        .ok();
    let mut missing_files = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, file_path FROM scenes
                 WHERE file_exists=0 AND file_path IS NOT NULL AND file_path != ''
                 ORDER BY file_name LIMIT 100",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .unwrap()
            .flatten();
        for (id, title, path) in rows {
            missing_files.push(serde_json::json!({
                "id": id,
                "title": title.unwrap_or_default(),
                "filePath": path,
            }));
        }
    }
    let (size_drift, size_drift_count, mtime_drift, mtime_drift_count) =
        detect_drift(&conn, &state.library_path);
    let (thumbs_missing_count, thumbs_missing_ids) =
        audit_thumbnails(&conn, &state.thumbnails_path);
    let studio_rows = studio_breakdown(&conn);
    serde_json::json!({
        "scenes": total,
        "filesOnDisk": on_disk,
        "missing": missing,
        "noFile": no_file,
        "totalBytes": bytes,
        "lastScan": last_scan,
        "libraryRoot": state.library_path.to_string_lossy(),
        "missingFiles": missing_files,
        "sizeDrift": size_drift,
        "sizeDriftCount": size_drift_count,
        "mtimeDrift": mtime_drift,
        "mtimeDriftCount": mtime_drift_count,
        "thumbnailsTotal": total,
        "thumbnailsMissing": thumbs_missing_count,
        "thumbnailsMissingIds": thumbs_missing_ids,
        "studios": studio_rows,
    })
}

/// Compare DB-recorded size/mtime against the live filesystem for scenes
/// flagged as present. Returns (size_drift_sample, size_drift_count,
/// mtime_drift_sample, mtime_drift_count). Samples capped at 50 each.
fn detect_drift(
    conn: &Connection,
    library_path: &Path,
) -> (
    Vec<serde_json::Value>,
    i64,
    Vec<serde_json::Value>,
    i64,
) {
    let mut size_sample = Vec::new();
    let mut mtime_sample = Vec::new();
    let mut size_count: i64 = 0;
    let mut mtime_count: i64 = 0;
    let mut stmt = match conn.prepare(
        "SELECT id, title, file_path, size_bytes, mtime FROM scenes
         WHERE file_exists=1 AND file_path IS NOT NULL AND file_path != ''",
    ) {
        Ok(s) => s,
        Err(_) => return (size_sample, 0, mtime_sample, 0),
    };
    let rows: Vec<(i64, Option<String>, String, i64, f64)> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get::<_, Option<i64>>(3)?.unwrap_or(0),
                r.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
            ))
        })
        .unwrap()
        .flatten()
        .collect();
    drop(stmt);
    for (id, title, path, db_size, db_mtime) in rows {
        let abs = match crate::api::resolve_video_path(library_path, &path) {
            Some(p) => p,
            None => continue,
        };
        let Ok(meta) = std::fs::metadata(&abs) else { continue };
        let disk_size = meta.len() as i64;
        if db_size != disk_size {
            size_count += 1;
            if size_sample.len() < 50 {
                size_sample.push(serde_json::json!({
                    "id": id,
                    "title": title.clone().unwrap_or_default(),
                    "filePath": path,
                    "dbSize": db_size,
                    "diskSize": disk_size,
                }));
            }
        }
        let disk_mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        if (disk_mtime - db_mtime).abs() > 1.0 {
            mtime_count += 1;
            if mtime_sample.len() < 50 {
                mtime_sample.push(serde_json::json!({
                    "id": id,
                    "title": title.clone().unwrap_or_default(),
                    "filePath": path,
                }));
            }
        }
    }
    (size_sample, size_count, mtime_sample, mtime_count)
}

/// Check `<thumbnails>/<sceneId>.jpg` for every scene. Returns
/// (missing_count, sample_missing_ids capped at 50).
fn audit_thumbnails(conn: &Connection, thumbnails_path: &Path) -> (i64, Vec<i64>) {
    let mut ids: Vec<i64> = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id FROM scenes") {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, i64>(0)) {
            ids = rows.flatten().collect();
        }
    }
    let mut missing_count: i64 = 0;
    let mut sample = Vec::new();
    for id in ids {
        if !thumbnails_path.join(format!("{id}.jpg")).exists() {
            missing_count += 1;
            if sample.len() < 50 {
                sample.push(id);
            }
        }
    }
    (missing_count, sample)
}

/// Shared mapping-classification inputs: reference sets + all scene rows.
/// Single definition consumed by both the audit and the review queue so the
/// queue can never disagree with the audit about a scene's status.
pub(crate) struct SceneRec {
    pub id: i64,
    pub title: String,
    pub file_name: String,
    pub file_path: String,
    pub studio: String,
    pub studio_id: String,
    pub performers_raw: String,
    pub performer_ids_raw: String,
}

pub(crate) struct Lookups {
    pub pids: HashSet<String>,
    pub pnames: HashSet<String>,
    pub studios: HashMap<String, String>,
    pub files_by_prefix: HashMap<String, Vec<String>>,
}

pub(crate) struct Classified {
    pub status: &'static str, // complete|partial|orphan|review_required
    pub reasons: Vec<&'static str>,
    pub valid_refs: Vec<String>,
    pub invalid_refs: Vec<String>,
    pub studio_ok: bool,
    pub studio_missing: bool,
    pub studio_drift: bool,
}

pub(crate) fn load_mapping_data(conn: &Connection, library_path: &Path) -> (Lookups, Vec<SceneRec>) {
    let pids: HashSet<String> = conn
        .prepare("SELECT id FROM performers")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let pnames: HashSet<String> = conn
        .prepare("SELECT name FROM performers WHERE name IS NOT NULL")
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let studios: HashMap<String, String> = conn
        .prepare("SELECT id, COALESCE(name,'') FROM studios")
        .map(|mut s| {
            s.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let scenes: Vec<SceneRec> = conn
        .prepare(
            "SELECT id, COALESCE(title,''), COALESCE(file_name,''), COALESCE(file_path,''),
                    COALESCE(studio,''), COALESCE(studio_id,''),
                    COALESCE(performers,'[]'), COALESCE(performer_ids,'')
             FROM scenes ORDER BY id",
        )
        .map(|mut s| {
            s.query_map([], |r| {
                Ok(SceneRec {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    file_name: r.get(2)?,
                    file_path: r.get(3)?,
                    studio: r.get(4)?,
                    studio_id: r.get(5)?,
                    performers_raw: r.get(6)?,
                    performer_ids_raw: r.get(7)?,
                })
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
        })
        .unwrap_or_default();
    let mut files_by_prefix: HashMap<String, Vec<String>> = HashMap::new();
    for f in collect_videos(library_path) {
        let digits: String = f.name.chars().take_while(|c| c.is_ascii_digit()).collect();
        if digits.len() >= 5 {
            files_by_prefix.entry(digits).or_default().push(f.stored);
        }
    }
    (
        Lookups { pids, pnames, studios, files_by_prefix },
        scenes,
    )
}

/// THE mapping-status rule (single definition). Reasons win; then both
/// sides → complete; one side → partial; neither → orphan. Exact matching
/// only — display names never establish identity.
pub(crate) fn classify_one(lk: &Lookups, rec: &SceneRec) -> Classified {
    let refs = norm_json_strings(Some(rec.performer_ids_raw.as_str()));
    let (valid, invalid): (Vec<String>, Vec<String>) =
        refs.into_iter().partition(|r| lk.pids.contains(r));
    let studio_ok = !rec.studio_id.is_empty() && lk.studios.contains_key(&rec.studio_id);
    let studio_missing = !rec.studio_id.is_empty() && !lk.studios.contains_key(&rec.studio_id);
    let studio_drift = studio_ok
        && !rec.studio.is_empty()
        && lk.studios.get(&rec.studio_id).map(|s| s != &rec.studio).unwrap_or(false);
    let display_names: Vec<String> = serde_json::from_str::<Vec<serde_json::Value>>(&rec.performers_raw)
        .ok()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|x| x.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let masked_by_name =
        !invalid.is_empty() && display_names.iter().any(|n| lk.pnames.contains(n));
    let prefix: String = rec
        .file_name
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    let multi_file = prefix.len() >= 5
        && lk.files_by_prefix.get(&prefix).map(|v| v.len() > 1).unwrap_or(false);
    let mut reasons = Vec::new();
    if masked_by_name {
        reasons.push("name-fallback-masks-bad-ref");
    }
    if multi_file {
        reasons.push("multi-file-prefix");
    }
    if !invalid.is_empty() && !masked_by_name {
        reasons.push("invalid-performer-ref");
    }
    let status = if !reasons.is_empty() {
        "review_required"
    } else if studio_ok && !valid.is_empty() {
        "complete"
    } else if studio_ok || !valid.is_empty() {
        "partial"
    } else {
        "orphan"
    };
    Classified {
        status,
        reasons,
        valid_refs: valid,
        invalid_refs: invalid,
        studio_ok,
        studio_missing,
        studio_drift,
    }
}

/// Phase-3 Metadata Review Queue (READ-ONLY). Buckets derived from the SAME
/// classification as the audit: `needs_performers` (studio known, no refs),
/// `needs_studio` (refs known, studio missing), `needs_both` (orphans),
/// `needs_review` (review_required). Items carry file context + display-only
/// suggestions; the human assigns canonical ids via PATCH /api/scenes/{id}.
pub fn review_queue(
    db: &Db,
    library_path: &Path,
    bucket: &str,
    page: i64,
    limit: i64,
) -> serde_json::Value {
    let conn = db.lock().unwrap();
    let (lk, scenes) = load_mapping_data(&conn, library_path);
    drop(conn);
    let limit = limit.clamp(1, 200);
    let page = page.max(1);
    let mut counts = std::collections::HashMap::from([
        ("needs_performers", 0i64),
        ("needs_studio", 0i64),
        ("needs_both", 0i64),
        ("needs_review", 0i64),
    ]);
    let mut picked: Vec<serde_json::Value> = Vec::new();
    for rec in &scenes {
        let c = classify_one(&lk, rec);
        let b = match c.status {
            "review_required" => "needs_review",
            "partial" => {
                if c.studio_ok {
                    "needs_performers"
                } else {
                    "needs_studio"
                }
            }
            "orphan" => "needs_both",
            _ => continue, // complete: not reviewable
        };
        *counts.get_mut(b).unwrap() += 1;
        if b == bucket {
            let suggestions: Vec<String> =
                serde_json::from_str::<Vec<serde_json::Value>>(&rec.performers_raw)
                    .ok()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(|x| x.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
            picked.push(serde_json::json!({
                "sceneId": rec.id,
                "title": rec.title,
                "fileName": rec.file_name,
                "filePath": rec.file_path,
                "studio": rec.studio,
                "studioId": rec.studio_id,
                "performerRefs": c.valid_refs,
                "suggestions": suggestions,
                "reasons": c.reasons,
                "status": c.status,
            }));
        }
    }
    let total = picked.len() as i64;
    let pages = (total + limit - 1) / limit;
    let start = ((page - 1) * limit) as usize;
    let items: Vec<serde_json::Value> = picked.into_iter().skip(start).take(limit as usize).collect();
    serde_json::json!({
        "bucket": bucket,
        "page": page,
        "limit": limit,
        "total": total,
        "pages": pages,
        "items": items,
        "counts": {
            "needs_performers": counts["needs_performers"],
            "needs_studio": counts["needs_studio"],
            "needs_both": counts["needs_both"],
            "needs_review": counts["needs_review"],
        },
    })
}

/// Phase-0 mapping audit (READ-ONLY — no writes).
/// Single source of truth assumption: `scenes.performer_ids` + `scenes.studio_id`.
/// Display fields (`scenes.performers[]`, `scenes.studio`) and
/// Display fields NEVER establish identity here; disagreements with
/// the forward direction are reported as mismatches/drift instead.
/// All matching is exact — no fuzzy or name-based resolution.
/// Per-scene mapping_status is computed, never stored:
///   complete        — valid studio_id + >=1 valid performer ref
///   partial         — exactly one side valid
///   orphan          — neither side
///   review_required — ambiguous signals needing a human (bad id ref that a
///                     name-fallback would have masked, studio name drift,
///                     multiple files sharing the scene's id prefix, ...)
/// The endpoint stays useful post-migration as a regression detector.
/// Takes `db` + `library_path` directly (instead of `AppState`) so the audit
/// is unit-testable without a Tauri runtime.
pub fn mapping_audit(db: &Db, library_path: &Path) -> serde_json::Value {
    let conn = db.lock().unwrap();
    let (lk, scenes) = load_mapping_data(&conn, library_path);
    // Element types actually stored in performer_ids (int vs text mix?).
    let type_mix: Vec<String> = conn
        .prepare(
            "SELECT DISTINCT typeof(value) FROM scenes, json_each(scenes.performer_ids)
              WHERE json_valid(scenes.performer_ids)",
        )
        .map(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let json_invalid_cells: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scenes
              WHERE performer_ids IS NOT NULL AND performer_ids != ''
                AND NOT json_valid(performer_ids)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let performer_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM performers", [], |r| r.get(0))
        .unwrap_or(0);
    drop(conn);

    let scene_id_set: std::collections::HashSet<i64> = scenes.iter().map(|s| s.id).collect();

    let mut complete = 0i64;
    let mut partial = 0i64;
    let mut orphan = 0i64;
    let mut review = 0i64;
    let mut invalid_ref_total = 0i64;
    let mut scenes_with_invalid = 0i64;
    let mut studio_missing = 0i64;
    let mut studio_drift = 0i64;
    let mut orphan_sample = Vec::new();
    let mut review_sample = Vec::new();
    let mut invalid_sample = Vec::new();
    let mut drift_sample = Vec::new();

    for rec in &scenes {
        let c = classify_one(&lk, rec);
        if !c.invalid_refs.is_empty() {
            invalid_ref_total += c.invalid_refs.len() as i64;
            scenes_with_invalid += 1;
            if invalid_sample.len() < 50 {
                invalid_sample.push(serde_json::json!({
                    "sceneId": rec.id, "title": rec.title,
                    "badRefs": c.invalid_refs,
                }));
            }
        }
        if c.studio_missing {
            studio_missing += 1;
            if drift_sample.len() < 50 {
                drift_sample.push(serde_json::json!({
                    "sceneId": rec.id, "title": rec.title,
                    "studioId": rec.studio_id, "studioDisplay": rec.studio,
                    "canonicalName": null, "kind": "unknown-studio-id",
                }));
            }
        }
        if c.studio_drift {
            studio_drift += 1;
            if drift_sample.len() < 50 {
                drift_sample.push(serde_json::json!({
                    "sceneId": rec.id, "title": rec.title,
                    "studioId": rec.studio_id, "studioDisplay": rec.studio,
                    "canonicalName": lk.studios.get(&rec.studio_id), "kind": "name-drift",
                }));
            }
        }

        match c.status {
            "review_required" => {
                review += 1;
                if review_sample.len() < 50 {
                    review_sample.push(serde_json::json!({
                        "sceneId": rec.id, "title": rec.title,
                        "filePath": rec.file_path,
                        "reasons": c.reasons,
                    }));
                }
            }
            "complete" => complete += 1,
            "partial" => partial += 1,
            _ => {
                orphan += 1;
                if orphan_sample.len() < 50 {
                    orphan_sample.push(serde_json::json!({
                        "sceneId": rec.id, "title": rec.title,
                        "filePath": rec.file_path,
                    }));
                }
            }
        }
    }

    // Phase 2B: the reverse-mismatch check is gone with the column it
    // validated. Forward truth (scenes.performer_ids) has no mirror to drift
    // from, so this whole failure class is eliminated, not merely monitored.

    // --- prefix collisions + unresolved files (scanner Phase-3 input) -------
    let mut collisions = 0i64;
    let mut collision_sample = Vec::new();
    let mut unresolved = 0i64;
    let mut unresolved_sample = Vec::new();
    let mut prefixes: Vec<&String> = lk.files_by_prefix.keys().collect();
    prefixes.sort();
    for p in prefixes {
        let files = &lk.files_by_prefix[p];
        if files.len() > 1 {
            collisions += 1;
            if collision_sample.len() < 50 {
                collision_sample.push(serde_json::json!({ "prefix": p, "files": files }));
            }
        }
        if p.parse::<i64>().map(|n| !scene_id_set.contains(&n)).unwrap_or(false) {
            unresolved += 1;
            if unresolved_sample.len() < 50 {
                unresolved_sample.push(serde_json::json!({ "prefix": p, "files": files }));
            }
        }
    }

    serde_json::json!({
        "summary": {
            "scenes": scenes.len(),
            "performers": performer_count,
            "studios": lk.studios.len(),
            "complete": complete,
            "partial": partial,
            "orphan": orphan,
            "reviewRequired": review,
            "invalidPerformerRefs": invalid_ref_total,
            "scenesWithInvalidRefs": scenes_with_invalid,
            "performerReverseMismatches": 0,
            "fallbackMasked": 0,
            "studioMissingId": studio_missing,
            "studioNameDrift": studio_drift,
            "typeMix": type_mix,
            "jsonInvalidCells": json_invalid_cells,
            "prefixCollisions": collisions,
            "unresolvedFiles": unresolved,
        },
        "samples": {
            "orphanScenes": orphan_sample,
            "reviewQueue": review_sample,
            "invalidPerformerReferences": invalid_sample,
            "reverseMismatches": [],
            "studioDrift": drift_sample,
            "prefixCollisions": collision_sample,
            "unresolvedFiles": unresolved_sample,
        },
    })
}

/// Normalize a JSON-array TEXT column to a Vec of exact-match strings.
/// Numbers become their string form; strings are kept verbatim (no fuzzy
/// cleanup — the audit reports what is there). Returns [] for NULL/''/invalid.
fn norm_json_strings(raw: Option<&str>) -> Vec<String> {
    let s = match raw {
        Some(x) if !x.trim().is_empty() => x,
        _ => return Vec::new(),
    };
    let v: serde_json::Value = match serde_json::from_str(s) {
        Ok(x) => x,
        Err(_) => return Vec::new(),
    };
    match v {
        serde_json::Value::Array(a) => a
            .into_iter()
            .filter_map(|e| match e {
                serde_json::Value::String(x) => Some(x),
                serde_json::Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_library(files: &[&str]) -> std::path::PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("pfx-audit-test-{}-{}", std::process::id(), std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        for f in files {
            std::fs::File::create(dir.join(f)).unwrap();
        }
        dir
    }

    #[test]
    fn audit_classifies_mapping_status() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('tushy','TUSHY')", []).unwrap();
            conn.execute(
                "INSERT INTO performers(id,name,slug) VALUES('adria-rae','Adria Rae','adria-rae')",
                [],
            ).unwrap();
            // review_required: valid links BUT multi-file prefix (see files below).
            conn.execute(
                "INSERT INTO scenes(id,title,file_name,file_path,studio,studio_id,performers,performer_ids)
                 VALUES(1505752,'T','1505752_720p.mp4','Porn/T/1505752_720p.mp4','TUSHY','tushy','[\"Adria Rae\"]','[\"adria-rae\"]')",
                [],
            ).unwrap();
            // partial: studio only.
            conn.execute(
                "INSERT INTO scenes(id,title,studio,studio_id,performer_ids)
                 VALUES(2,'P','TUSHY','tushy','[]')",
                [],
            ).unwrap();
            // orphan: no links at all.
            conn.execute("INSERT INTO scenes(id,title) VALUES(3,'O')", []).unwrap();
            // review_required: invalid performer ref.
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids) VALUES(4,'B','[\"ghost\"]')",
                [],
            ).unwrap();
        }
        let lib = test_library(&["1505752_720p.mp4", "1505752_480m.mp4", "7777777_720p.mp4"]);
        let audit = mapping_audit(&db, &lib);
        let s = &audit["summary"];
        assert_eq!(s["scenes"], 4);
        assert_eq!(s["complete"], 0);
        assert_eq!(s["partial"], 1);
        assert_eq!(s["orphan"], 1);
        assert_eq!(s["reviewRequired"], 2);
        assert_eq!(s["invalidPerformerRefs"], 1);
        // Phase 2B: no reverse cache remains, so nothing can mismatch.
        assert_eq!(s["performerReverseMismatches"], 0);
        assert_eq!(s["prefixCollisions"], 1);
        assert_eq!(s["unresolvedFiles"], 1);
        assert_eq!(s["typeMix"], serde_json::json!(["text"]));
        std::fs::remove_dir_all(&lib).ok();
    }

    #[test]
    fn parse_descriptive_forms() {
        // Long form: title + DD.MM.YYYY_RES → ISO date.
        let (t, d, r) =
            parse_descriptive("Marica Hase - Alexis Tae - Intimate Worship  25.04.2022_480m");
        assert_eq!(t, "Marica Hase - Alexis Tae - Intimate Worship");
        assert_eq!(d, "2022-04-25");
        assert_eq!(r, "480m");
        // Short form: no date; trailing _RES stripped; performers untouched.
        let (t, d, r) = parse_descriptive("Donkey Punch  12.06.2021_720");
        assert_eq!(t, "Donkey Punch");
        assert_eq!(d, "2021-06-12");
        assert_eq!(r, "720");
        // Numeric stems keep working (prefix-create path titles).
        let (t, d, r) = parse_descriptive("1266572_480m");
        assert_eq!((t.as_str(), d.as_str(), r.as_str()), ("1266572", "", "480m"));
        // Out-of-range "date" is NOT a date — stays plain title, no fake ISO.
        let (t, d, _) = parse_descriptive("Show  99.99.2022_480");
        assert_eq!(d, "");
        assert!(t.contains("99.99.2022"));
    }

    /// Phase-3 queue: same classification as the audit, split into buckets
    /// with pagination. Complete scenes never appear.
    #[test]
    fn review_queue_buckets_and_pages() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('tushy','TUSHY')", []).unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('a-rae','A Rae')", []).unwrap();
            // complete — excluded everywhere.
            conn.execute(
                "INSERT INTO scenes(id,title,studio,studio_id,performer_ids)
                 VALUES(1,'C','TUSHY','tushy','[\"a-rae\"]')",
                [],
            )
            .unwrap();
            // partial, studio known → needs_performers.
            conn.execute(
                "INSERT INTO scenes(id,title,studio,studio_id,performer_ids)
                 VALUES(2,'P','TUSHY','tushy','[]')",
                [],
            )
            .unwrap();
            // partial, refs known → needs_studio.
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids) VALUES(3,'S','[\"a-rae\"]')",
                [],
            )
            .unwrap();
            // orphan → needs_both.
            conn.execute("INSERT INTO scenes(id,title) VALUES(4,'O')", []).unwrap();
            // invalid ref → needs_review.
            conn.execute(
                "INSERT INTO scenes(id,title,performer_ids) VALUES(5,'B','[\"ghost\"]')",
                [],
            )
            .unwrap();
        }
        let lib = test_library(&[]);
        let q = review_queue(&db, &lib, "needs_performers", 1, 50);
        assert_eq!(q["total"], 1);
        assert_eq!(q["items"][0]["sceneId"], 2);
        assert_eq!(q["counts"]["needs_performers"], 1);
        assert_eq!(q["counts"]["needs_studio"], 1);
        assert_eq!(q["counts"]["needs_both"], 1);
        assert_eq!(q["counts"]["needs_review"], 1);
        let q2 = review_queue(&db, &lib, "needs_both", 1, 50);
        assert_eq!(q2["items"][0]["sceneId"], 4);
        // Pagination: page beyond content is empty but totals hold.
        let q3 = review_queue(&db, &lib, "needs_both", 2, 50);
        assert_eq!(q3["total"], 1);
        assert!(q3["items"].as_array().unwrap().is_empty());
        std::fs::remove_dir_all(&lib).ok();
    }

    /// Acceptance test for the Phase-2A identity fix. Before: the scanner
    /// created an AUTOINCREMENT placeholder for 1266572_480m.mp4 even though
    /// scene 1266572 existed with a missing file. After: it adopts scene 1266572.
    #[test]
    fn scanner_adopts_existing_scene_by_prefix() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO scenes(id,title,file_name,file_path,studio_id)
                 VALUES(1266572,'T','1266572_720p.mp4','Porn/T/1266572_720p.mp4','s1')",
                [],
            ).unwrap();
        }
        let lib = test_library(&["1266572_480m.mp4"]);
        let res = scan_library(&db, &lib);
        assert_eq!(res.adopted, 1);
        assert_eq!(res.created, 0);
        assert_eq!(res.conflicts, 0);
        let conn = db.lock().unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM scenes", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        let (exists, path): (i64, String) = conn
            .query_row("SELECT file_exists, file_path FROM scenes WHERE id=1266572", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(exists, 1);
        assert!(path.ends_with("1266572_480m.mp4"));
        std::fs::remove_dir_all(&lib).ok();
    }

    /// Two resolution variants of one unknown prefix must yield ONE scene
    /// (using the prefix as id), never two placeholder rows.
    #[test]
    fn scanner_prefix_creates_single_scene() {
        let db = crate::seed::open_memory();
        let lib = test_library(&["1266572_720p.mp4", "1266572_480m.mp4"]);
        let res = scan_library(&db, &lib);
        assert_eq!(res.new, 1);
        assert_eq!(res.created, 1);
        assert_eq!(res.conflicts, 1);
        let conn = db.lock().unwrap();
        let ids: Vec<i64> = conn
            .prepare("SELECT id FROM scenes")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(ids, vec![1266572]);
        std::fs::remove_dir_all(&lib).ok();
    }

    #[test]
    fn slugify_id_cases() {
        assert_eq!(slugify_id("Mommy's Girl"), "mommys-girl");
        assert_eq!(slugify_id("Babes.com"), "babes-com");
        assert_eq!(slugify_id("BLACKED RAW"), "blacked-raw");
        assert_eq!(slugify_id("Devil's Film"), "devils-film");
        assert_eq!(slugify_id(""), "");
    }

    /// Filename credit splitting across the observed filename shapes.
    #[test]
    fn split_filename_credits_forms() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('mommys-girl','Mommys Girl')", []).unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('jane-wilde','Jane Wilde')", []).unwrap();
        }
        let conn = db.lock().unwrap();
        // Root long form: studio + performers + dated title.
        let (s, p, t) = split_filename_credits(
            &conn,
            "Mommy's Girl - Alexis Fawx - Jane Wilde - Still Desirable  02.02.2019_480m",
            "",
        );
        assert_eq!(s, Some("Mommy's Girl".to_string()));
        assert_eq!(p, vec!["Alexis Fawx".to_string(), "Jane Wilde".to_string()]);
        assert_eq!(t, "Still Desirable  02.02.2019_480m");
        // Folder long form: no studio, performers + title.
        let (s, p, t) = split_filename_credits(
            &conn,
            "Marica Hase - Alexis Tae - Intimate Worship  25.04.2022_480m",
            "All Girl Massage",
        );
        assert_eq!(s, None);
        assert_eq!(p, vec!["Marica Hase".to_string(), "Alexis Tae".to_string()]);
        assert_eq!(t, "Intimate Worship  25.04.2022_480m");
        // Short form: comma list, title preserved whole.
        let (s, p, t) = split_filename_credits(
            &conn,
            "Before I Marry Him - Ana Foxxx, Eliza Ibarra",
            "Babes.com",
        );
        assert_eq!(s, None);
        assert_eq!(p, vec!["Ana Foxxx".to_string(), "Eliza Ibarra".to_string()]);
        assert_eq!(t, "Before I Marry Him");
        // Two-part root: known studio (punctuation-insensitive) → studio.
        let (s, p, t) = split_filename_credits(&conn, "Mommys Girl - Some Title  02.02.2019_480m", "");
        assert_eq!(s, Some("Mommys Girl".to_string()));
        assert!(p.is_empty());
        // Two-part root: performer head → credits, no studio.
        let (s, p, t) = split_filename_credits(&conn, "Jane Wilde - Some Title  02.02.2019_480m", "");
        assert_eq!(s, None);
        assert_eq!(p, vec!["Jane Wilde".to_string()]);
        assert_eq!(t, "Some Title  02.02.2019_480m");
        // Two-part root, unknown head, undated → whole stem stays title.
        let (s, p, t) = split_filename_credits(&conn, "Some Title - Subtitle", "");
        assert_eq!(s, None);
        assert!(p.is_empty());
        assert_eq!(t, "Some Title - Subtitle");
        // Numeric stems unaffected.
        let (s, p, t) = split_filename_credits(&conn, "1266572_480m", "");
        assert_eq!(s, None);
        assert!(p.is_empty());
        assert_eq!(t, "1266572_480m");
    }

    /// End-to-end credit build: apostrophe studio slug-matches, known
    /// performer links, unknown stays display-only, title-dash fragment folds
    /// back, categories inherit the studio signature.
    #[test]
    fn build_new_meta_links_credits() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('mommys-girl','Mommys Girl')", []).unwrap();
            conn.execute("INSERT INTO categories(id,name) VALUES('lesbian','Lesbian')", []).unwrap();
            conn.execute(
                "UPDATE studios SET signature_categories='[\"lesbian\"]' WHERE id='mommys-girl'",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('alexis-fawx','Alexis Fawx')", []).unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('jane-wilde','Jane Wilde')", []).unwrap();
        }
        let conn = db.lock().unwrap();
        let f = VideoFile {
            name: "Mommy's Girl - Alexis Fawx - New Star - Still Desirable  02.02.2019_480m.mp4".into(),
            stem: "Mommy's Girl - Alexis Fawx - New Star - Still Desirable  02.02.2019_480m".into(),
            rel: "x.mp4".into(),
            stored: "Porn/x.mp4".into(),
            parent: "".into(),
            size: 1,
            mtime: 0.0,
        };
        let meta = build_new_meta(&conn, &f);
        assert_eq!(meta.studio_id, "mommys-girl");
        assert_eq!(meta.studio, "Mommys Girl");
        assert!(meta.studio_created.is_none());
        assert_eq!(meta.title, "Still Desirable");
        assert_eq!(meta.date, "2019-02-02");
        assert_eq!(meta.performer_ids_json, "[\"alexis-fawx\"]");
        // Unknown "New Star" kept display-only alongside the linked name.
        assert!(meta.performers_json.contains("Alexis Fawx"));
        assert!(meta.performers_json.contains("New Star"));
        assert_eq!(meta.unknown_names, vec!["New Star".to_string()]);
        assert_eq!(meta.link_count, 1);
        assert_eq!(meta.category_ids_json, "[\"lesbian\"]");
    }

    /// Ambiguous middle segments ("Lesbian Encounters" in a title with a
    /// dash) stay display-only instead of becoming bogus performers or
    /// polluting the title — the human fixes it via the review queue.
    /// Digit/`#` fragments ("Women Loving Girls #3") DO fold back.
    #[test]
    fn build_new_meta_folds_title_dashes() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('abella-danger','Abella Danger')", []).unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('jane-wilde','Jane Wilde')", []).unwrap();
        }
        let conn = db.lock().unwrap();
        let f = VideoFile {
            name: "Devil's Film - Abella Danger - Jane Wilde - Lesbian Encounters - Scene 1  14.03.2019_480m.mp4".into(),
            stem: "Devil's Film - Abella Danger - Jane Wilde - Lesbian Encounters - Scene 1  14.03.2019_480m".into(),
            rel: "x.mp4".into(),
            stored: "Porn/x.mp4".into(),
            parent: "".into(),
            size: 1,
            mtime: 0.0,
        };
        let meta = build_new_meta(&conn, &f);
        // Unknown studio is created, not left dangling.
        assert_eq!(meta.studio_id, "devils-film");
        assert_eq!(meta.studio, "Devil's Film");
        assert_eq!(meta.studio_created, Some("Devil's Film".to_string()));
        assert_eq!(meta.title, "Scene 1");
        assert_eq!(meta.performer_ids_json, "[\"abella-danger\",\"jane-wilde\"]");
        // Ambiguous fragment stays display-only (never identity), flagged for review.
        assert!(meta.performers_json.contains("Lesbian Encounters"));
        assert_eq!(meta.unknown_names, vec!["Lesbian Encounters".to_string()]);
    }

    /// Digit/`#` fragments fold back into the title.
    #[test]
    fn build_new_meta_folds_hash_fragments() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('jane-wilde','Jane Wilde')", []).unwrap();
        }
        let conn = db.lock().unwrap();
        let f = VideoFile {
            name: "X-Studio - Jane Wilde - Women Loving Girls #3 - Real Title  01.02.2020_480m.mp4".into(),
            stem: "X-Studio - Jane Wilde - Women Loving Girls #3 - Real Title  01.02.2020_480m".into(),
            rel: "x.mp4".into(),
            stored: "Porn/x.mp4".into(),
            parent: "".into(),
            size: 1,
            mtime: 0.0,
        };
        let meta = build_new_meta(&conn, &f);
        assert_eq!(meta.title, "Women Loving Girls #3 - Real Title");
        assert_eq!(meta.performer_ids_json, "[\"jane-wilde\"]");
        assert!(!meta.performers_json.contains("Women Loving"));
    }

    /// Full scan of a root descriptive file creates the scene with credits.
    #[test]
    fn scanner_creates_scene_with_filename_credits() {
        let db = crate::seed::open_memory();
        {
            let conn = db.lock().unwrap();
            conn.execute("INSERT INTO studios(id,name) VALUES('brazzers','Brazzers')", []).unwrap();
            conn.execute("INSERT INTO performers(id,name) VALUES('keiran-lee','Keiran Lee')", []).unwrap();
        }
        let lib = test_library(&[
            "Brazzers - Keiran Lee - Giselle Palmer - Slow And Sexy  04.10.2018_480m.mp4",
        ]);
        let res = scan_library(&db, &lib);
        assert_eq!(res.new, 1);
        assert_eq!(res.performer_links, 1);
        assert!(res.unknown_performers.contains(&"Giselle Palmer".to_string()));
        let conn = db.lock().unwrap();
        let (studio_id, pids, disp, title): (String, String, String, String) = conn
            .query_row(
                "SELECT studio_id, performer_ids, performers, title FROM scenes LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(studio_id, "brazzers");
        assert_eq!(pids, "[\"keiran-lee\"]");
        assert!(disp.contains("Keiran Lee") && disp.contains("Giselle Palmer"));
        assert_eq!(title, "Slow And Sexy");
        std::fs::remove_dir_all(&lib).ok();
    }
}

/// Per-studio scene counts with missing-file counts, most scenes first.
fn studio_breakdown(conn: &Connection) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT COALESCE(studio_id, ''), COALESCE(studio, ''),
                COUNT(*), SUM(CASE WHEN file_exists=0 THEN 1 ELSE 0 END)
         FROM scenes GROUP BY studio_id, studio ORDER BY COUNT(*) DESC",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<i64>>(3)?.unwrap_or(0),
            ))
        }) {
            for row in rows.flatten() {
                out.push(serde_json::json!({
                    "studioId": row.0,
                    "studio": row.1,
                    "scenes": row.2,
                    "missing": row.3,
                }));
            }
        }
    }
    out
}