use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default)]
pub struct Settings {
    pub library_path: Option<String>,
    pub server_port: Option<u16>,
    pub keybindings: Option<HashMap<String, String>>,
    pub backup_mode: Option<String>,
    /// Whisper model preference: "auto" (default, largest English model on
    /// disk), a size token ("tiny"|"base"|"small"|"medium"|"large"), or an
    /// exact model filename (e.g. "ggml-small.en.bin").
    pub whisper_model: Option<String>,
}

impl Settings {
    pub fn data_dir() -> PathBuf {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("PersonalFlix")
    }

    pub fn path() -> PathBuf {
        Self::data_dir().join("settings.json")
    }

    pub fn db_path() -> PathBuf {
        Self::data_dir().join("app.db")
    }

    pub fn load() -> Settings {
        match fs::read_to_string(Self::path()) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => Settings::default(),
        }
    }

    pub fn save(&self) {
        let dir = Self::data_dir();
        let _ = fs::create_dir_all(&dir);
        if let Ok(s) = serde_json::to_string_pretty(self) {
            let _ = fs::write(Self::path(), s);
        }
    }

    pub fn library_path(&self) -> Option<PathBuf> {
        self.library_path.as_ref().map(PathBuf::from)
    }

    pub fn server_port(&self) -> u16 {
        self.server_port.unwrap_or(SERVER_PORT)
    }

    /// "off" | "daily" | "weekly". Defaults to "off".
    pub fn backup_mode(&self) -> String {
        match self.backup_mode.as_deref() {
            Some("daily") => "daily".to_string(),
            Some("weekly") => "weekly".to_string(),
            _ => "off".to_string(),
        }
    }

    /// Whisper model preference. Defaults to "auto".
    pub fn whisper_model_name(&self) -> String {
        match self.whisper_model.as_deref().map(str::trim) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => "auto".to_string(),
        }
    }

    pub fn backups_dir() -> PathBuf {
        Self::data_dir().join("backups")
    }
}

const SERVER_PORT: u16 = 31731;

/// Walk up from the executable directory or search drives for a folder
/// that contains the seed JSON files (scenes_db.json), i.e. the media library root.
pub fn detect_library_path() -> Option<PathBuf> {
    // 1. Walk up from the executable directory
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..8 {
            if let Some(d) = &dir {
                if d.join("scenes_db.json").exists() {
                    return Some(d.clone());
                }
                dir = d.parent().map(|p| p.to_path_buf());
            } else {
                break;
            }
        }
    }

    // 2. Check candidate paths across drives
    for candidate in [
        r"P:\Personal\Porn",
        r"S:\Project\Python\venv\Lib\site-packages\New folder\Porn",
        r"D:\Personal\Porn",
        r"C:\Personal\Porn",
    ] {
        let p = PathBuf::from(candidate);
        if p.join("scenes_db.json").exists() {
            return Some(p);
        }
    }

    // 3. Scan roots of all drives for \Personal\Porn or \Porn
    for drive in ["P:\\", "S:\\", "D:\\", "E:\\", "C:\\"] {
        let p1 = PathBuf::from(drive).join("Personal").join("Porn");
        if p1.join("scenes_db.json").exists() {
            return Some(p1);
        }
        let p2 = PathBuf::from(drive).join("Porn");
        if p2.join("scenes_db.json").exists() {
            return Some(p2);
        }
    }

    None
}