use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::api::download::FetchJob;
use crate::api::transcribe::{BatchJob, TranscribeJob};

/// Shared fetch-job table (fetch-from-URL progress).
pub type FetchJobs = Arc<Mutex<HashMap<String, FetchJob>>>;

/// Shared per-scene whisper transcription jobs.
pub type TranscribeJobs = Arc<Mutex<HashMap<i64, TranscribeJob>>>;

/// Shared batch transcription job (single-flight; None until first use).
pub type TranscribeBatch = Arc<Mutex<Option<BatchJob>>>;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub library_path: PathBuf,
    pub thumbnails_path: PathBuf,
    pub performers_path: PathBuf,
    pub studios_path: PathBuf,
    pub fetch_jobs: FetchJobs,
    pub transcribe_jobs: TranscribeJobs,
    pub transcribe_batch: TranscribeBatch,
    pub app_handle: tauri::AppHandle,
}