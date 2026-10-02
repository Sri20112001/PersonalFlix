use crate::api::resolve_video_path;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, patch};
use axum::{Json, Router};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/{id}", get(track))
        .route("/{id}/cues", get(list_cues))
        .route("/{id}/cues/{index}", patch(update_cue))
}

#[derive(Deserialize, Default)]
struct TrackQuery {
    /// `?format=srt` serves the SubRip twin (download for VLC) instead of VTT.
    format: Option<String>,
}

/// Serve the sidecar caption file for a scene as WebVTT.
/// Looks next to the video file for `<stem>.vtt`, `<stem>.srt`
/// (plus `.en` variants); SRT is converted to VTT on the fly.
/// With `?format=srt` the SRT twin is served instead (download for VLC),
/// converting from VTT on the fly when no `.srt` sidecar exists.
/// 404 when the scene, the video, or any sidecar is missing.
async fn track(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(q): Query<TrackQuery>,
) -> Result<Response<Body>, StatusCode> {
    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .ok()
    };
    let Some(file_path) = file_path else {
        return Err(StatusCode::NOT_FOUND);
    };
    let Some(video) = resolve_video_path(&state.library_path, &file_path) else {
        return Err(StatusCode::NOT_FOUND);
    };
    let stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    if stem.is_empty() {
        return Err(StatusCode::NOT_FOUND);
    }
    let dir = video.parent();
    let read_cand = |name: &str| {
        let p = match dir {
            Some(d) => d.join(name),
            None => std::path::PathBuf::from(name),
        };
        std::fs::read(&p).ok()
    };
    if q.format.as_deref().is_some_and(|f| f.eq_ignore_ascii_case("srt")) {
        // Prefer a real `.srt` sidecar; else convert the VTT on the fly.
        for cand in [format!("{stem}.en.srt"), format!("{stem}.srt")] {
            if let Some(bytes) = read_cand(&cand) {
                return srt_response(&bytes, &format!("{stem}.en.srt"));
            }
        }
        for cand in [format!("{stem}.en.vtt"), format!("{stem}.vtt")] {
            if let Some(bytes) = read_cand(&cand) {
                let srt = vtt_to_srt(&String::from_utf8_lossy(&bytes));
                return srt_response(srt.as_bytes(), &format!("{stem}.en.srt"));
            }
        }
        return Err(StatusCode::NOT_FOUND);
    }
    let mut found: Option<(Vec<u8>, bool)> = None;
    for cand in [
        format!("{stem}.vtt"),
        format!("{stem}.srt"),
        format!("{stem}.en.vtt"),
        format!("{stem}.en.srt"),
    ] {
        let p = match dir {
            Some(d) => d.join(&cand),
            None => std::path::PathBuf::from(&cand),
        };
        if let Ok(bytes) = tokio::fs::read(&p).await {
            let is_vtt = cand.ends_with(".vtt");
            found = Some((bytes, is_vtt));
            break;
        }
    }
    let Some((bytes, is_vtt)) = found else {
        return Err(StatusCode::NOT_FOUND);
    };
    let text = String::from_utf8_lossy(&bytes);
    let vtt = if is_vtt {
        ensure_header(&text)
    } else {
        srt_to_vtt(&text)
    };
    Response::builder()
        .header("Content-Type", "text/vtt; charset=utf-8")
        .header("Cache-Control", "no-cache")
        .body(Body::from(vtt))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn ensure_header(src: &str) -> String {
    let trimmed = src.trim_start_matches('\u{feff}');
    if trimmed.starts_with("WEBVTT") {
        trimmed.to_string()
    } else {
        format!("WEBVTT\n\n{trimmed}")
    }
}

/// Minimal SubRip → WebVTT: header + dot timestamps on `-->` lines.
/// Cue identifiers and basic tags (`<i>`, `<b>`) carry over as-is.
fn srt_to_vtt(src: &str) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for line in src.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.contains("-->") {
            out.push_str(&line.replace(',', "."));
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    out
}

fn srt_response(bytes: &[u8], filename: &str) -> Result<Response<Body>, StatusCode> {
    Response::builder()
        .header("Content-Type", "application/x-subrip; charset=utf-8")
        .header(
            "Content-Disposition",
            format!("attachment; filename=\"{filename}\""),
        )
        .header("Cache-Control", "no-cache")
        .body(Body::from(bytes.to_vec()))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// Minimal WebVTT → SubRip: drops the header, NOTE/STYLE blocks, cue
/// identifiers and cue settings, swaps `.`→`,` in timestamps, and strips
/// VTT-only tags (`<c>`, `<v>`, `<lang>`, timestamps) while keeping the
/// basic `<b>/<i>/<u>/<font>` tags VLC understands.
pub(crate) fn vtt_to_srt(src: &str) -> String {
    let src = src.trim_start_matches('\u{feff}');
    let mut out = String::new();
    let mut n = 0u32;
    // Split on blank lines; the first block is the WEBVTT header.
    for block in src.replace("\r\n", "\n").replace('\r', "\n").split("\n\n") {
        let lines: Vec<&str> = block.lines().filter(|l| !l.trim().is_empty()).collect();
        if lines.is_empty() {
            continue;
        }
        if lines[0].starts_with("WEBVTT") || lines[0].starts_with("NOTE") {
            continue;
        }
        if lines[0] == "STYLE" || lines[0] == "REGION" {
            continue;
        }
        // First line is either a cue identifier or the timestamp line.
        let mut idx = 0;
        if !lines[0].contains("-->") {
            idx = 1;
        }
        if lines.len() <= idx || !lines[idx].contains("-->") {
            continue;
        }
        let timing = srt_timing(lines[idx]);
        let text: Vec<String> = lines[idx + 1..].iter().map(|l| strip_vtt_tags(l)).collect();
        if text.iter().all(|l| l.trim().is_empty()) {
            continue;
        }
        n += 1;
        out.push_str(&format!("{n}\n{timing}\n{}\n\n", text.join("\n")));
    }
    out
}

/// `00:00:00.000 --> 00:00:02.000 line:90%` → `00:00:00,000 --> 00:00:02,000`.
fn srt_timing(line: &str) -> String {
    let mut parts = line.split("-->");
    let conv = |s: &str| {
        s.split_whitespace()
            .next()
            .unwrap_or("")
            .replace('.', ",")
    };
    match (parts.next(), parts.next()) {
        (Some(a), Some(b)) => format!("{} --> {}", conv(a), conv(b)),
        _ => line.replace('.', ","),
    }
}

fn strip_vtt_tags(line: &str) -> String {    let mut s = line.to_string();
    // Remove VTT-only spans; keep <b>/<i>/<u>/<font> for VLC.
    for tag in ["c", "v", "lang"] {
        loop {
            let open = format!("<{tag}");
            let Some(start) = s.find(&open) else { break };
            let Some(end) = s[start..].find('>') else { break };
            s.replace_range(start..start + end + 1, "");
        }
        s = s.replace(&format!("</{tag}>"), "");
    }
    // Inline timestamps `<00:00:01.000>` have no SRT equivalent.
    let mut pos = 0;
    loop {
        let Some(rel) = s[pos..].find('<') else { break };
        let start = pos + rel;
        let rest = &s[start..];
        let Some(end) = rest.find('>') else { break };
        let inner = &rest[1..end];
        let is_ts = inner.contains(':')
            && inner
                .chars()
                .all(|c| c.is_ascii_digit() || c == ':' || c == '.' || c == ',');
        if is_ts {
            s.replace_range(start..start + end + 1, "");
            pos = start;
        } else {
            pos = start + end + 1;
        }
    }
    s
}

// ---------------------------------------------------------------------------
// Editable transcript: cues as JSON + text edits written back to disk.
// The file `track()` would serve is canonical; its twin (vtt<->srt) is
// regenerated on every edit so VLC and the browser never diverge.
// ---------------------------------------------------------------------------

/// A single caption cue for the transcript UI.
#[derive(Serialize, Clone)]
struct Cue {
    index: usize,
    start: f64,
    end: f64,
    text: String,
}

/// Parsed cue preserving file layout for lossless rewrites.
pub(crate) struct ParsedCue {
    pub(crate) ident: Option<String>,
    pub(crate) start_raw: String,
    pub(crate) end_raw: String,
    pub(crate) settings: String,
    pub(crate) lines: Vec<String>,
}

#[derive(Deserialize)]
struct CueUpdate {
    text: String,
}

fn scene_video(state: &AppState, id: i64) -> Option<std::path::PathBuf> {
    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .ok()
    };
    let fp = file_path?;
    let video = resolve_video_path(&state.library_path, &fp)?;
    video.exists().then_some(video)
}

/// Existing sidecars in `track()` preference order: (path, is_vtt).
fn sidecar_paths(video: &std::path::Path) -> Vec<(std::path::PathBuf, bool)> {
    let stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    if stem.is_empty() {
        return vec![];
    }
    let dir = video.parent();
    let join = |name: &str| match dir {
        Some(d) => d.join(name),
        None => std::path::PathBuf::from(name),
    };
    [
        (format!("{stem}.vtt"), true),
        (format!("{stem}.srt"), false),
        (format!("{stem}.en.vtt"), true),
        (format!("{stem}.en.srt"), false),
    ]
    .into_iter()
    .map(|(name, is_vtt)| (join(&name), is_vtt))
    .filter(|(p, _)| p.exists())
    .collect()
}

/// `00:01:02.580` / `00:01:02,580` → seconds.
fn parse_timestamp(s: &str) -> Option<f64> {
    let s = s.trim().replace(',', ".");
    let mut parts: Vec<&str> = s.split(':').collect();
    if parts.len() < 2 {
        return None;
    }
    let secs: f64 = parts.pop()?.parse().ok()?;
    let mins: f64 = parts.pop()?.parse().ok()?;
    let hours: f64 = if parts.is_empty() {
        0.0
    } else {
        parts.pop()?.parse().ok()?
    };
    if !parts.is_empty() {
        return None;
    }
    Some(hours * 3600.0 + mins * 60.0 + secs)
}

/// Split a timing line into (start, end, trailing cue settings).
fn split_timing(line: &str) -> Option<(String, String, String)> {
    let (left, right) = line.split_once("-->")?;
    let mut rparts = right.split_whitespace();
    let end = rparts.next()?.to_string();
    let settings: Vec<&str> = rparts.collect();
    let start = left.split_whitespace().last()?.to_string();
    if parse_timestamp(&start).is_none() || parse_timestamp(&end).is_none() {
        return None;
    }
    Some((start, end, settings.join(" ")))
}

fn norm_blocks(src: &str) -> Vec<Vec<String>> {
    src.replace("\r\n", "\n")
        .replace('\r', "\n")
        .split("\n\n")
        .map(|b| {
            b.lines()
                .map(|l| l.to_string())
                .skip_while(|l| l.trim().is_empty())
                .collect::<Vec<_>>()
        })
        .filter(|v: &Vec<String>| !v.is_empty())
        .collect()
}

pub(crate) fn parse_vtt_cues(src: &str) -> Vec<ParsedCue> {
    let src = src.trim_start_matches('\u{feff}');
    let mut cues = vec![];
    for lines in norm_blocks(src) {
        if lines[0].starts_with("WEBVTT")
            || lines[0].starts_with("NOTE")
            || lines[0] == "STYLE"
            || lines[0] == "REGION"
        {
            continue;
        }
        let mut idx = 0;
        let mut ident = None;
        if !lines[0].contains("-->") {
            ident = Some(lines[0].clone());
            idx = 1;
        }
        if lines.len() <= idx {
            continue;
        }
        let Some((start_raw, end_raw, settings)) = split_timing(&lines[idx]) else {
            continue;
        };
        cues.push(ParsedCue {
            ident,
            start_raw,
            end_raw,
            settings,
            lines: lines[idx + 1..].to_vec(),
        });
    }
    cues
}

pub(crate) fn parse_srt_cues(src: &str) -> Vec<ParsedCue> {
    let mut cues = vec![];
    for lines in norm_blocks(src) {
        let mut idx = 0;
        // Optional numeric counter line.
        if !lines[0].contains("-->") {
            if lines[0].trim().parse::<u32>().is_ok() {
                idx = 1;
            } else {
                continue;
            }
        }
        if lines.len() <= idx {
            continue;
        }
        let Some((start_raw, end_raw, _)) = split_timing(&lines[idx]) else {
            continue;
        };
        cues.push(ParsedCue {
            ident: None,
            start_raw,
            end_raw,
            settings: String::new(),
            lines: lines[idx + 1..].to_vec(),
        });
    }
    cues
}

fn parsed_to_cue(index: usize, c: &ParsedCue) -> Option<Cue> {
    Some(Cue {
        index,
        start: parse_timestamp(&c.start_raw)?,
        end: parse_timestamp(&c.end_raw)?,
        text: c
            .lines
            .iter()
            .map(|l| strip_vtt_tags(l).trim_end().to_string())
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string(),
    })
}

pub(crate) fn emit_vtt(cues: &[ParsedCue]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for c in cues {
        if let Some(id) = &c.ident {
            out.push_str(id);
            out.push('\n');
        }
        out.push_str(&c.start_raw);
        out.push_str(" --> ");
        out.push_str(&c.end_raw);
        if !c.settings.is_empty() {
            out.push(' ');
            out.push_str(&c.settings);
        }
        out.push('\n');
        for l in &c.lines {
            out.push_str(l);
            out.push('\n');
        }
        out.push('\n');
    }
    out
}

pub(crate) fn emit_srt(cues: &[ParsedCue]) -> String {
    let mut out = String::new();
    for (i, c) in cues.iter().enumerate() {
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            c.start_raw.replace('.', ","),
            c.end_raw.replace('.', ","),
            c.lines.join("\n")
        ));
    }
    out
}

/// Twin path with the subtitle extension swapped (`x.en.vtt` ↔ `x.en.srt`).
/// Parse a sidecar (VTT when `is_vtt`, else SRT) and shift every cue by
/// `offset_secs`. Used to merge independently-transcribed audio chunks into
/// one absolute timeline (chunking bounds Whisper's previous-text
/// conditioning so a music intro can't drag a whole file into ♪♪ loops).
pub(crate) fn parse_shifted(src: &str, is_vtt: bool, offset_secs: f64) -> Vec<ParsedCue> {
    let mut cues = if is_vtt {
        parse_vtt_cues(src)
    } else {
        parse_srt_cues(src)
    };
    if offset_secs != 0.0 {
        for c in &mut cues {
            if let (Some(s), Some(e)) =
                (parse_timestamp(&c.start_raw), parse_timestamp(&c.end_raw))
            {
                c.start_raw = fmt_timestamp(s + offset_secs);
                c.end_raw = fmt_timestamp(e + offset_secs);
            }
        }
    }
    cues
}

/// Seconds → `HH:MM:SS.mmm`.
pub(crate) fn fmt_timestamp(secs: f64) -> String {
    let ms = (secs.max(0.0) * 1000.0).round() as u64;
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        ms / 3_600_000,
        (ms / 60_000) % 60,
        (ms / 1000) % 60,
        ms % 1000
    )
}

fn twin_path(p: &std::path::Path) -> Option<std::path::PathBuf> {
    match p.extension().and_then(|e| e.to_str()) {
        Some("vtt") => Some(p.with_extension("srt")),
        Some("srt") => Some(p.with_extension("vtt")),
        _ => None,
    }
}

async fn list_cues(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let video = scene_video(&state, id).ok_or(StatusCode::NOT_FOUND)?;
    let found = sidecar_paths(&video);
    let (path, is_vtt) = found.into_iter().next().ok_or(StatusCode::NOT_FOUND)?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let text = String::from_utf8_lossy(&bytes);
    let parsed = if is_vtt {
        parse_vtt_cues(&text)
    } else {
        parse_srt_cues(&text)
    };
    let cues: Vec<Cue> = parsed
        .iter()
        .enumerate()
        .filter_map(|(i, c)| parsed_to_cue(i, c))
        .collect();
    Ok(Json(json!({
        "cues": cues,
        "source": path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
    })))
}

async fn update_cue(
    State(state): State<AppState>,
    Path((id, index)): Path<(i64, usize)>,
    Json(body): Json<CueUpdate>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let text = body.text.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<String> = text.lines().map(|l| l.trim_end().to_string()).collect();
    let clean = lines.join("\n").trim().to_string();
    if clean.is_empty() || clean.len() > 2000 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let video = scene_video(&state, id).ok_or(StatusCode::NOT_FOUND)?;
    let found = sidecar_paths(&video);
    let (path, is_vtt) = found.into_iter().next().ok_or(StatusCode::NOT_FOUND)?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let text = String::from_utf8_lossy(&bytes);
    let mut parsed = if is_vtt {
        parse_vtt_cues(&text)
    } else {
        parse_srt_cues(&text)
    };
    let cue = parsed.get_mut(index).ok_or(StatusCode::NOT_FOUND)?;
    cue.lines = clean.lines().map(|l| l.to_string()).collect();

    // Rewrite the canonical file, then regenerate its twin so the
    // browser track and VLC never diverge.
    let canonical = if is_vtt {
        emit_vtt(&parsed)
    } else {
        emit_srt(&parsed)
    };
    tokio::fs::write(&path, &canonical)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(twin) = twin_path(&path) {
        let twin_text = if is_vtt {
            vtt_to_srt(&canonical)
        } else {
            srt_to_vtt(&canonical)
        };
        tokio::fs::write(&twin, twin_text)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    let updated = parsed_to_cue(index, &parsed[index]).ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "cue": updated })))
}
