//! Whisper transcription: generate sidecar captions for a scene.
//!
//! Uses the local whisper.cpp build already staged under
//! `%LOCALAPPDATA%\PersonalFlix\tools\whisper` (whisper-cli.exe + ggml models)
//! plus `ffmpeg` on PATH for audio extraction. The model follows the
//! `whisper_model` setting ("auto" = largest English model on disk).
//! Everything stays offline; output is a `<video-stem>.en.vtt` sidecar (for the
//! browser `<track>` element) plus a `<video-stem>.en.srt` sidecar (for VLC,
//! which auto-loads same-folder subtitles). Both are served by
//! `GET /api/subtitles/{id}` (`?format=srt` for the SRT download).
//!
//! - GET  `/api/transcribe/status` → engine availability
//! - POST `/api/transcribe/{id}`   → start (single-flight per scene)
//! - GET  `/api/transcribe/{id}`   → job status + sidecar presence
//! - POST `/api/transcribe/batch`  → start batch (single-flight, sequential)
//! - GET  `/api/transcribe/batch`  → batch progress
//! - DELETE `/api/transcribe/batch` → request cancellation
//!
//! The batch worker processes scene ids strictly one at a time (whisper
//! already saturates the CPU with up to 8 threads), updating both the
//! per-scene job table and the shared batch progress record.

use crate::api::now_iso;
use crate::api::resolve_video_path;
use crate::settings::Settings;
use crate::state::{AppState, TranscribeBatch, TranscribeJobs};
use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Cap batch size so a runaway selection can't queue hundreds of hours.
const MAX_BATCH: usize = 200;

/// 16kHz mono s16 wav: bytes per second of audio.
const WAV_BYTES_PER_SEC: f64 = 32000.0;

/// Files longer than this are transcribed in independent chunks (fresh
/// decoder context per chunk) instead of one long conditioning chain.

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/status", get(engine_status))
        .route("/batch", get(batch_status).post(start_batch).delete(cancel_batch))
        .route("/{id}", get(job_status).post(start_job))
}

#[derive(Serialize, Clone, Default)]
pub struct TranscribeJob {
    pub scene_id: i64,
    /// queued | extracting | transcribing | done | error
    pub state: String,
    pub message: Option<String>,
    pub has_sidecar: bool,
    pub updated_at: String,
}

fn jobs_table(state: &AppState) -> TranscribeJobs {
    state.transcribe_jobs.clone()
}

/// Locate whisper-cli.exe + a model under the app data dir.
/// Falls back to the first `*.bin` in models/ when base.en is missing.
fn locate_engine() -> Option<(PathBuf, PathBuf)> {
    locate_engine_with(&Settings::load().whisper_model_name())
}

/// All staged ggml models, largest first.
fn list_models() -> Option<Vec<(String, PathBuf, u64)>> {
    let models = Settings::data_dir().join("tools").join("whisper").join("models");
    let mut out: Vec<(String, PathBuf, u64)> = std::fs::read_dir(&models)
        .ok()?
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("bin") {
                return None;
            }
            let name = p.file_name()?.to_str()?.to_string();
            let bytes = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            Some((name, p, bytes))
        })
        .collect();
    out.sort_by(|a, b| b.2.cmp(&a.2));
    if out.is_empty() { None } else { Some(out) }
}

/// Filenames of staged ggml models (for settings validation).
pub(crate) fn model_names() -> Vec<String> {
    list_models()
        .unwrap_or_default()
        .into_iter()
        .map(|(name, _, _)| name)
        .collect()
}

/// Pick a model honoring `preference`:
/// - "auto" (default): largest English (`*.en.bin`) model, else largest `*.bin`.
///   The larger model transcribes markedly more dialogue (measured: small.en
///   produced 32 precise cues / 602 chars vs base.en's 6 smeared segments /
///   455 chars on the same 90s clip, recovering whole dropped lines).
/// - size token ("tiny"|"base"|"small"|"medium"|"large"): first model whose
///   filename contains it.
/// - anything else: exact filename match.
fn select_model(models: &[(String, PathBuf, u64)], preference: &str) -> Option<PathBuf> {
    let pref = preference.trim().to_lowercase();
    if pref.is_empty() || pref == "auto" {
        return models
            .iter()
            .find(|(n, _, _)| n.contains(".en."))
            .or_else(|| models.first())
            .map(|(_, p, _)| p.clone());
    }
    if ["tiny", "base", "small", "medium", "large"].contains(&pref.as_str()) {
        let token = format!("{pref}.");
        let token2 = format!("-{pref}");
        return models
            .iter()
            .find(|(n, _, _)| {
                let l = n.to_lowercase();
                l.contains(&token) || l.contains(&token2)
            })
            .map(|(_, p, _)| p.clone());
    }
    models
        .iter()
        .find(|(n, _, _)| n.to_lowercase() == pref)
        .map(|(_, p, _)| p.clone())
}

fn locate_engine_with(preference: &str) -> Option<(PathBuf, PathBuf)> {
    let root = Settings::data_dir().join("tools").join("whisper");
    let cli = root.join("Release").join("whisper-cli.exe");
    if !cli.exists() {
        return None;
    }
    let models = list_models();
    // Legacy layout: base.en preferred only when it is the sole model.
    let preferred = models
        .as_deref()
        .and_then(|m| select_model(m, preference))
        .or_else(|| {
            let fallback = root.join("models").join("ggml-base.en.bin");
            fallback.exists().then_some(fallback)
        })?;
    Some((cli, preferred))
}

fn sidecar_candidates(video: &std::path::Path) -> Vec<PathBuf> {
    let stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let dir = video.parent();
    ["en.vtt", "vtt", "en.srt", "srt"]
        .iter()
        .map(|ext| match dir {
            Some(d) => d.join(format!("{stem}.{ext}")),
            None => PathBuf::from(format!("{stem}.{ext}")),
        })
        .collect()
}

fn find_sidecar(video: &std::path::Path) -> Option<PathBuf> {
    sidecar_candidates(video).into_iter().find(|p| p.exists())
}

/// Where a newly generated transcript lands (never clobbers a hand-made
/// `<stem>.vtt`; generated files always use the `.en.vtt` suffix).
fn output_sidecar(video: &std::path::Path) -> PathBuf {
    let stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("captions");
    match video.parent() {
        Some(d) => d.join(format!("{stem}.en.vtt")),
        None => PathBuf::from(format!("{stem}.en.vtt")),
    }
}

/// SRT twin of [`output_sidecar`] for external players (VLC auto-loads
/// same-folder `<stem>.en.srt`).
fn output_srt_sidecar(video: &std::path::Path) -> PathBuf {
    let stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("captions");
    match video.parent() {
        Some(d) => d.join(format!("{stem}.en.srt")),
        None => PathBuf::from(format!("{stem}.en.srt")),
    }
}

async fn engine_status(State(state): State<AppState>) -> Json<serde_json::Value> {
    let engine = locate_engine();
    // A scene counts as "captioned" when any sidecar exists for its video.
    let (captioned, total): (i64, i64) = {
        let conn = state.db.lock().unwrap();
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM scenes", [], |r| r.get(0))
            .unwrap_or(0);
        drop(conn);
        (0, total)
    };
    match engine {
        Some((cli, model)) => {
            let models: Vec<serde_json::Value> = list_models()
                .unwrap_or_default()
                .into_iter()
                .map(|(name, _, bytes)| serde_json::json!({ "name": name, "bytes": bytes }))
                .collect();
            Json(serde_json::json!({
                "available": true,
                "cli": cli.to_string_lossy(),
                "model": model.to_string_lossy(),
                "model_name": model.file_name().and_then(|s| s.to_str()).unwrap_or(""),
                "models": models,
                "preference": Settings::load().whisper_model_name(),
                "scenes": total,
                "captioned": captioned,
            }))
        }
        None => Json(serde_json::json!({
            "available": false,
            "message": "whisper-cli.exe or a ggml model is missing under %LOCALAPPDATA%/PersonalFlix/tools/whisper",
        })),
    }
}

async fn job_status(State(state): State<AppState>, Path(id): Path<i64>) -> Json<serde_json::Value> {
    let jobs = jobs_table(&state);
    if let Some(j) = jobs.lock().unwrap().get(&id).cloned() {
        return Json(serde_json::json!(j));
    }
    // No live job: report whether a sidecar already exists.
    let has = scene_sidecar_exists(&state, id);
    Json(serde_json::json!(TranscribeJob {
        scene_id: id,
        state: if has { "done".into() } else { "idle".into() },
        message: None,
        has_sidecar: has,
        updated_at: now_iso(),
    }))
}

#[derive(Deserialize, Default)]
struct StartBody {
    /// When true, regenerate even if a sidecar already exists.
    force: Option<bool>,
}

async fn start_job(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    body: Option<Json<StartBody>>,
) -> Json<serde_json::Value> {
    let force = body.map(|b| b.force.unwrap_or(false)).unwrap_or(false);

    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .ok()
        .flatten()
    };
    let Some(fp) = file_path else {
        return Json(serde_json::json!({ "error": "unknown scene" }));
    };
    let Some(video) = resolve_video_path(&state.library_path, &fp) else {
        return Json(serde_json::json!({ "error": "video file not found" }));
    };
    if !video.exists() {
        return Json(serde_json::json!({ "error": "video file not found on disk" }));
    }
    if !force && find_sidecar(&video).is_some() {
        return Json(serde_json::json!(TranscribeJob {
            scene_id: id,
            state: "done".into(),
            message: Some("captions already exist".into()),
            has_sidecar: true,
            updated_at: now_iso(),
        }));
    }
    {
        let jobs = jobs_table(&state);
        let guard = jobs.lock().unwrap();
        if let Some(j) = guard.get(&id) {
            if matches!(j.state.as_str(), "queued" | "extracting" | "transcribing") {
                return Json(serde_json::json!({ "job": j, "dedup": true }));
            }
        }
    }
    let Some((cli, model)) = locate_engine() else {
        return Json(serde_json::json!({ "error": "whisper engine not installed" }));
    };
    {
        let jobs = jobs_table(&state);
        jobs.lock().unwrap().insert(
            id,
            TranscribeJob {
                scene_id: id,
                state: "queued".into(),
                message: Some(format!(
                    "queued with {}",
                    model.file_name().and_then(|s| s.to_str()).unwrap_or("model")
                )),
                has_sidecar: false,
                updated_at: now_iso(),
            },
        );
    }
    let st = state.clone();
    tokio::spawn(async move { run_transcribe(st, id, video, cli, model).await });
    let jobs = jobs_table(&state);
    let j = jobs.lock().unwrap().get(&id).cloned().unwrap_or_default();
    Json(serde_json::json!({ "job": j }))
}

fn scene_sidecar_exists(state: &AppState, id: i64) -> bool {
    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .ok()
        .flatten()
    };
    let Some(fp) = file_path else { return false };
    let Some(video) = resolve_video_path(&state.library_path, &fp) else {
        return false;
    };
    find_sidecar(&video).is_some()
}

fn set_job(jobs: &TranscribeJobs, id: i64, state: &str, message: Option<String>) {
    if let Some(j) = jobs.lock().unwrap().get_mut(&id) {
        j.state = state.to_string();
        j.message = message;
        j.updated_at = now_iso();
    }
}

/// Fraction of VTT cue text lines that carry no speech (music notes,
/// bracketed tags like `[Music]`, or blanks). Whisper collapses to ♪♪ walls
/// on music-heavy audio; callers use this to annotate the job.
fn music_only_ratio(vtt: &str) -> f64 {
    let mut total = 0u32;
    let mut music = 0u32;
    for block in vtt.replace("\r\n", "\n").split("\n\n") {
        let lines: Vec<&str> = block.lines().collect();
        if lines.is_empty() || lines[0].starts_with("WEBVTT") {
            continue;
        }
        let mut idx = 0;
        if !lines[0].contains("-->") {
            idx = 1;
        }
        if lines.len() <= idx || !lines[idx].contains("-->") {
            continue;
        }
        for line in &lines[idx + 1..] {
            let t = line.trim();
            if t.is_empty() {
                continue;
            }
            total += 1;
            let stripped: String = t
                .chars()
                .filter(|c| !matches!(c, '♪' | '♫' | '*' | '-' | ' '))
                .collect();
            let lower = stripped.to_lowercase();
            let bare = lower
                .trim_matches(|c: char| {
                    c == '[' || c == ']' || c == '(' || c == ')' || c == '.' || c == '!' || c == ' '
                })
                .to_string();
            if stripped.is_empty()
                || ["music", "musik", "musica", "silence"].contains(&bare.as_str())
            {
                music += 1;
            }
        }
    }
    if total == 0 {
        0.0
    } else {
        music as f64 / total as f64
    }
}

const CHUNK_SECS: f64 = 600.0;

async fn run_transcribe(
    state: AppState,
    id: i64,
    video: PathBuf,
    cli: PathBuf,
    model: PathBuf,
) {
    let jobs = jobs_table(&state);
    let tmp = std::env::temp_dir().join("personalflix-whisper");
    let _ = std::fs::create_dir_all(&tmp);
    let wav = tmp.join(format!("{id}.wav"));
    let out_stem = tmp.join(format!("{id}"));

    set_job(&jobs, id, "extracting", Some("extracting 16kHz audio with ffmpeg".into()));
    let wav_str = wav.to_string_lossy().to_string();
    let vid_str = video.to_string_lossy().to_string();
    let extract = tokio::process::Command::new("ffmpeg")
        .args([
            "-y", "-v", "error", "-i", &vid_str, "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "pcm_s16le", &wav_str,
        ])
        .status()
        .await;
    match extract {
        Ok(s) if s.success() && wav.exists() => {}
        Ok(s) => {
            set_job(&jobs, id, "error", Some(format!("ffmpeg failed (exit {s})")));
            return;
        }
        Err(e) => {
            set_job(&jobs, id, "error", Some(format!("ffmpeg not available: {e}")));
            return;
        }
    }

    set_job(
        &jobs,
        id,
        "transcribing",
        Some(format!(
            "transcribing with {}",
            model.file_name().and_then(|s| s.to_str()).unwrap_or("whisper")
        )),
    );
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8).to_string())
        .unwrap_or_else(|_| "4".into());
    // Long files collapse into repetition loops because every window
    // conditions on all previous text. Split them into fresh-context chunks.
    let wav_secs = std::fs::metadata(&wav)
        .map(|m| m.len() as f64 / WAV_BYTES_PER_SEC)
        .unwrap_or(0.0);
    if wav_secs > CHUNK_SECS {
        run_transcribe_chunked(
            &state, id, &video, &cli, &model, &wav, wav_secs, &tmp, &jobs, &threads,
        )
        .await;
        return;
    }
    let model_str = model.to_string_lossy().to_string();
    let out_str = out_stem.to_string_lossy().to_string();
    // whisper-cli appends `.vtt` / `.srt` to the `-of` stem.
    // Recall-tuned decode: pinned beam search (`-bo`/`-bs`) for stable
    // hypotheses plus a gentler silence gate (`-nth 0.5` instead of the
    // 0.6 default) so quiet/close-mic lines aren't skipped as "no speech".
    let tr = tokio::process::Command::new(&cli)
        .args([
            "-m", &model_str, "-f", &wav_str, "-l", "en", "-ovtt", "-osrt", "-of", &out_str,
            "-t", &threads, "-np", "-bo", "5", "-bs", "5", "-nth", "0.5",
        ])
        .current_dir(cli.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from(".")))
        .status()
        .await;
    if let Err(e) = tr {
        set_job(&jobs, id, "error", Some(format!("whisper failed to start: {e}")));
        let _ = std::fs::remove_file(&wav);
        return;
    }
    let produced = PathBuf::from(format!("{out_str}.vtt"));
    if !produced.exists() {
        // whisper-cli may name output after the input stem on some builds.
        let alt = tmp.join(format!("{id}.wav.vtt"));
        if alt.exists() {
            let _ = std::fs::rename(&alt, &produced);
        }
    }
    if !produced.exists() {
        set_job(&jobs, id, "error", Some("whisper produced no output (silence?)".into()));
        let _ = std::fs::remove_file(&wav);
        return;
    }
    // SRT twin: native output when the build supports `-osrt`, otherwise
    // converted from the VTT so VLC always gets a sidecar.
    let produced_srt = PathBuf::from(format!("{out_str}.srt"));
    if !produced_srt.exists() {
        let alt = tmp.join(format!("{id}.wav.srt"));
        if alt.exists() {
            let _ = std::fs::rename(&alt, &produced_srt);
        }
    }

    let vtt_text = match std::fs::read(&produced) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(e) => {
            set_job(&jobs, id, "error", Some(format!("cannot read whisper output: {e}")));
            let _ = std::fs::remove_file(&wav);
            let _ = std::fs::remove_file(&produced);
            let _ = std::fs::remove_file(&produced_srt);
            return;
        }
    };
    let srt_opt = std::fs::read(&produced_srt)
        .ok()
        .map(|sb| String::from_utf8_lossy(&sb).into_owned());
    finish_transcribe(&jobs, id, &video, vtt_text, srt_opt).await;
    let _ = std::fs::remove_file(&wav);
    let _ = std::fs::remove_file(&produced);
    let _ = std::fs::remove_file(&produced_srt);
}

/// Write the VTT (+ SRT twin) sidecars next to the video and mark the job.
async fn finish_transcribe(
    jobs: &TranscribeJobs,
    id: i64,
    video: &PathBuf,
    vtt_text: String,
    srt_opt: Option<String>,
) {
    let dest = output_sidecar(video);
    let dest_srt = output_srt_sidecar(video);
    // Guarantee a WEBVTT header so <track> parsers accept it.
    let vtt = if vtt_text.trim_start_matches('﻿').starts_with("WEBVTT") {
        vtt_text
    } else {
        format!("WEBVTT\n\n{vtt_text}")
    };
    if let Err(e) = std::fs::write(&dest, &vtt) {
        set_job(jobs, id, "error", Some(format!("cannot write sidecar: {e}")));
        return;
    }
    let srt_text = srt_opt.unwrap_or_else(|| crate::api::subtitles::vtt_to_srt(&vtt));
    if let Err(e) = std::fs::write(&dest_srt, &srt_text) {
        set_job(jobs, id, "error", Some(format!("cannot write SRT sidecar: {e}")));
        return;
    }
    let base_msg = dest_srt
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("captions.srt")
        .to_string();
    // Flag degenerate output (e.g. a wall of music notes on music-only
    // audio) so "no dialogue in the video" isn't mistaken for a failure.
    let msg = if music_only_ratio(&vtt) > 0.7 {
        format!("{base_msg} (mostly non-speech audio)")
    } else {
        base_msg
    };
    let mut guard = jobs.lock().unwrap();
    if let Some(j) = guard.get_mut(&id) {
        j.state = "done".into();
        j.has_sidecar = true;
        j.message = Some(msg);
        j.updated_at = now_iso();
    }
}

/// Transcribe a long file in CHUNK_SECS pieces with fresh decoder context
/// each, then merge the shifted cues into one absolute timeline. Chunking
/// bounds Whisper's previous-text conditioning: without it, a music-heavy
/// opening can drag a whole 30+ minute file into a ♪♪ repetition loop even
/// where real dialogue exists (verified: full-file run all-♪♪ vs chunked
/// runs recovering full dialogue on the same audio).
async fn run_transcribe_chunked(
    state: &AppState,
    id: i64,
    video: &PathBuf,
    cli: &PathBuf,
    model: &PathBuf,
    wav: &PathBuf,
    wav_secs: f64,
    tmp: &std::path::Path,
    jobs: &TranscribeJobs,
    threads: &str,
) {
    let model_name = model
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("whisper")
        .to_string();
    let model_str = model.to_string_lossy().to_string();
    let wav_str = wav.to_string_lossy().to_string();
    let n = (wav_secs / CHUNK_SECS).ceil() as usize;
    let mut vtt_all = vec![];
    let mut srt_all = vec![];
    let mut srt_complete = true;
    let mut ok_chunks = 0usize;

    for i in 0..n {
        let start = i as f64 * CHUNK_SECS;
        let len = (wav_secs - start).min(CHUNK_SECS);
        set_job(
            jobs,
            id,
            "transcribing",
            Some(format!("transcribing part {}/{} with {}", i + 1, n, model_name)),
        );
        let chunk_wav = tmp.join(format!("{id}_c{i}.wav"));
        let chunk_stem = tmp.join(format!("{id}_c{i}"));
        let chunk_wav_str = chunk_wav.to_string_lossy().to_string();
        let chunk_out_str = chunk_stem.to_string_lossy().to_string();
        let start_s = start.to_string();
        let len_s = len.to_string();

        // Input seeking on wav is sample-accurate and fast.
        let split = tokio::process::Command::new("ffmpeg")
            .args([
                "-y", "-v", "error", "-ss", &start_s, "-t", &len_s, "-i", &wav_str,
                "-c:a", "pcm_s16le", &chunk_wav_str,
            ])
            .status()
            .await;
        if !matches!(split, Ok(s) if s.success() && chunk_wav.exists()) {
            let _ = std::fs::remove_file(&chunk_wav);
            continue;
        }
        let tr = tokio::process::Command::new(cli)
            .args([
                "-m", &model_str, "-f", &chunk_wav_str, "-l", "en", "-ovtt", "-osrt",
                "-of", &chunk_out_str, "-t", threads, "-np", "-bo", "5", "-bs", "5",
                "-nth", "0.5",
            ])
            .current_dir(cli.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from(".")))
            .status()
            .await;
        // Claim the VTT (with the input-stem fallback name some builds use).
        let chunk_vtt = PathBuf::from(format!("{chunk_out_str}.vtt"));
        if !chunk_vtt.exists() {
            let alt = tmp.join(format!("{id}_c{i}.wav.vtt"));
            if alt.exists() {
                let _ = std::fs::rename(&alt, &chunk_vtt);
            }
        }
        // Same for the SRT twin.
        let chunk_srt = PathBuf::from(format!("{chunk_out_str}.srt"));
        if !chunk_srt.exists() {
            let alt = tmp.join(format!("{id}_c{i}.wav.srt"));
            if alt.exists() {
                let _ = std::fs::rename(&alt, &chunk_srt);
            }
        }
        let vtt_text = std::fs::read(&chunk_vtt)
            .ok()
            .map(|b| String::from_utf8_lossy(&b).into_owned());
        let srt_text = std::fs::read(&chunk_srt)
            .ok()
            .map(|b| String::from_utf8_lossy(&b).into_owned());
        let _ = std::fs::remove_file(&chunk_wav);
        let _ = std::fs::remove_file(&chunk_vtt);
        let _ = std::fs::remove_file(&chunk_srt);
        if tr.is_err() {
            continue;
        }
        let Some(vtt_text) = vtt_text else { continue };
        vtt_all.extend(crate::api::subtitles::parse_shifted(&vtt_text, true, start));
        match srt_text {
            Some(s) => {
                srt_all.extend(crate::api::subtitles::parse_shifted(&s, false, start));
            }
            None => srt_complete = false,
        }
        ok_chunks += 1;
    }

    let _ = std::fs::remove_file(wav);
    if ok_chunks == 0 {
        set_job(&jobs, id, "error", Some("whisper produced no output (silence?)".into()));
        return;
    }
    // Elide the state update noise; finish_transcribe sets the final state.
    let _ = state;
    let merged_vtt = crate::api::subtitles::emit_vtt(&vtt_all);
    let merged_srt = if srt_complete && !srt_all.is_empty() {
        Some(crate::api::subtitles::emit_srt(&srt_all))
    } else {
        None
    };
    finish_transcribe(jobs, id, video, merged_vtt, merged_srt).await;
}

// ---------------------------------------------------------------------------
// Batch transcription: sequential queue over many scenes.
// ---------------------------------------------------------------------------

/// Progress record for the single-flight batch job.
#[derive(Serialize, Clone, Default)]
pub struct BatchJob {
    /// queued | running | done | error | cancelled | idle
    pub state: String,
    pub total: usize,
    pub done: usize,
    pub succeeded: usize,
    pub skipped: usize,
    pub failed: usize,
    pub current_id: Option<i64>,
    pub message: Option<String>,
    pub cancel_requested: bool,
    pub updated_at: String,
}

#[derive(Deserialize, Default)]
struct BatchBody {
    ids: Option<Vec<i64>>,
    /// When true, regenerate even where a sidecar already exists.
    force: Option<bool>,
}

fn update_batch(batch: &TranscribeBatch, f: impl FnOnce(&mut BatchJob)) {
    if let Some(b) = batch.lock().unwrap().as_mut() {
        f(b);
        b.updated_at = now_iso();
    }
}

fn batch_is_live(b: &BatchJob) -> bool {
    matches!(b.state.as_str(), "queued" | "running")
}

async fn batch_status(State(state): State<AppState>) -> Json<serde_json::Value> {
    match state.transcribe_batch.lock().unwrap().clone() {
        Some(b) => Json(serde_json::json!(b)),
        None => Json(serde_json::json!({ "state": "idle" })),
    }
}

async fn cancel_batch(State(state): State<AppState>) -> Json<serde_json::Value> {
    let mut guard = state.transcribe_batch.lock().unwrap();
    match guard.as_mut() {
        Some(b) if batch_is_live(b) => {
            b.cancel_requested = true;
            b.updated_at = now_iso();
            Json(serde_json::json!({ "cancelled": true, "batch": b.clone() }))
        }
        Some(b) => Json(serde_json::json!({ "cancelled": false, "batch": b.clone() })),
        None => Json(serde_json::json!({ "cancelled": false, "state": "idle" })),
    }
}

async fn start_batch(
    State(state): State<AppState>,
    body: Option<Json<BatchBody>>,
) -> Json<serde_json::Value> {
    let body = body.map(|b| b.0).unwrap_or_default();
    let force = body.force.unwrap_or(false);
    let mut ids = body.ids.unwrap_or_default();
    // De-dupe while preserving selection order.
    {
        let mut seen = std::collections::HashSet::new();
        ids.retain(|id| seen.insert(*id));
    }
    if ids.is_empty() {
        return Json(serde_json::json!({ "error": "no scene ids provided" }));
    }
    let truncated = ids.len() > MAX_BATCH;
    ids.truncate(MAX_BATCH);

    {
        let guard = state.transcribe_batch.lock().unwrap();
        if let Some(b) = guard.as_ref() {
            if batch_is_live(b) {
                return Json(serde_json::json!({ "batch": b.clone(), "dedup": true }));
            }
        }
    }
    // Refuse to start without an engine so the batch can't fail per-item.
    if locate_engine().is_none() {
        return Json(serde_json::json!({ "error": "whisper engine not installed" }));
    }
    let total = ids.len();
    *state.transcribe_batch.lock().unwrap() = Some(BatchJob {
        state: "queued".into(),
        total,
        message: Some(if truncated {
            format!("queued {total} scenes (capped at {MAX_BATCH})")
        } else {
            format!("queued {total} scenes")
        }),
        updated_at: now_iso(),
        ..Default::default()
    });
    let st = state.clone();
    tokio::spawn(async move { run_batch(st, ids, force).await });
    match state.transcribe_batch.lock().unwrap().clone() {
        Some(b) => Json(serde_json::json!({ "batch": b })),
        None => Json(serde_json::json!({ "error": "batch failed to start" })),
    }
}

fn per_scene_is_live(state: &AppState, id: i64) -> bool {
    state
        .transcribe_jobs
        .lock()
        .unwrap()
        .get(&id)
        .map(|j| matches!(j.state.as_str(), "queued" | "extracting" | "transcribing"))
        .unwrap_or(false)
}

fn lookup_video(state: &AppState, id: i64) -> Option<PathBuf> {
    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT file_path FROM scenes WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .ok()
        .flatten()
    };
    let fp = file_path?;
    let video = resolve_video_path(&state.library_path, &fp)?;
    video.exists().then_some(video)
}

/// Sequential worker: one scene at a time, tallying into the batch record.
async fn run_batch(state: AppState, ids: Vec<i64>, force: bool) {
    let batch = state.transcribe_batch.clone();
    update_batch(&batch, |b| {
        b.state = "running".into();
        b.message = Some(format!("starting batch of {}", ids.len()));
    });
    let Some((cli, model)) = locate_engine() else {
        update_batch(&batch, |b| {
            b.state = "error".into();
            b.message = Some("whisper engine not installed".into());
        });
        return;
    };
    let model_name = model
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("model")
        .to_string();

    for id in ids {
        if batch
            .lock()
            .unwrap()
            .as_ref()
            .map(|b| b.cancel_requested)
            .unwrap_or(false)
        {
            update_batch(&batch, |b| {
                b.state = "cancelled".into();
                b.current_id = None;
                b.message = Some(format!("cancelled after {}/{} scenes", b.done, b.total));
            });
            return;
        }
        update_batch(&batch, |b| {
            b.current_id = Some(id);
            b.message = Some(format!("scene {id} ({}/{})", b.done + 1, b.total));
        });

        // Skip scenes whose file is gone or whose captions already exist.
        let video = match lookup_video(&state, id) {
            Some(v) => v,
            None => {
                state.transcribe_jobs.lock().unwrap().insert(
                    id,
                    TranscribeJob {
                        scene_id: id,
                        state: "error".into(),
                        message: Some("video file not found on disk".into()),
                        has_sidecar: false,
                        updated_at: now_iso(),
                    },
                );
                update_batch(&batch, |b| {
                    b.failed += 1;
                    b.done += 1;
                });
                continue;
            }
        };
        if !force && find_sidecar(&video).is_some() {
            state.transcribe_jobs.lock().unwrap().insert(
                id,
                TranscribeJob {
                    scene_id: id,
                    state: "done".into(),
                    message: Some("captions already exist".into()),
                    has_sidecar: true,
                    updated_at: now_iso(),
                },
            );
            update_batch(&batch, |b| {
                b.skipped += 1;
                b.done += 1;
            });
            continue;
        }
        // Don't collide with a live single-scene job on the same id
        // (both would write the same temp wav file).
        if per_scene_is_live(&state, id) {
            update_batch(&batch, |b| {
                b.skipped += 1;
                b.done += 1;
            });
            continue;
        }
        state.transcribe_jobs.lock().unwrap().insert(
            id,
            TranscribeJob {
                scene_id: id,
                state: "queued".into(),
                message: Some(format!("queued by batch ({model_name})")),
                has_sidecar: false,
                updated_at: now_iso(),
            },
        );
        // Await inline: strictly sequential, no two whispers at once.
        run_transcribe(state.clone(), id, video, cli.clone(), model.clone()).await;
        let ok = state
            .transcribe_jobs
            .lock()
            .unwrap()
            .get(&id)
            .map(|j| j.state == "done")
            .unwrap_or(false);
        update_batch(&batch, |b| {
            if ok {
                b.succeeded += 1;
            } else {
                b.failed += 1;
            }
            b.done += 1;
        });
    }
    update_batch(&batch, |b| {
        b.state = "done".into();
        b.current_id = None;
        b.message = Some(format!(
            "batch complete: {} ok, {} skipped, {} failed (of {})",
            b.succeeded, b.skipped, b.failed, b.total
        ));
    });
}
