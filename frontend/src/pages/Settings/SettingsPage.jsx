import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/apiClient";
import { ROUTES } from "../../constants/routes";
import MediaLibraryCard from "./MediaLibraryCard";
import SystemDiagnosticsCard from "./SystemDiagnosticsCard";
import DisplayCard from "./DisplayCard";
import CaptionsCard from "./CaptionsCard";
import BackupsCard from "./BackupsCard";

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [settings, setSettings] = useState(null);
  const [libraryPath, setLibraryPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [backups, setBackups] = useState([]);
  const [lastBackup, setLastBackup] = useState(null);
  const [backupMsg, setBackupMsg] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "unreachable" }));

    api
      .settings()
      .then((s) => {
        setSettings(s);
        if (s && s.library_path) {
          setLibraryPath(s.library_path);
        }
      })
      .catch(() => {});

    api
      .backupList()
      .then((b) => {
        setBackups(b.backups || []);
        setLastBackup(b.lastBackup || null);
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg("");
    try {
      const updated = await api.updateSettings({ library_path: libraryPath });
      setSettings(updated);
      setSavedMsg("Library path updated successfully!");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch (err) {
      setSavedMsg("Failed to update settings: " + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const statusText = health
    ? health.ok || health.status === "ok"
      ? "Operational"
      : health.status || "Unreachable"
    : "Checking...";
  const isOk = health ? health.ok === true || health.status === "ok" : false;

  const refreshBackups = () =>
    api
      .backupList()
      .then((b) => {
        setBackups(b.backups || []);
        setLastBackup(b.lastBackup || null);
      })
      .catch(() => {});

  const downloadBackup = async () => {
    setBackupBusy(true);
    setBackupMsg("");
    try {
      const doc = await api.backupExport();
      const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: "application/json",
      });
      const day = (doc.exported_at || new Date().toISOString()).slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `personalflix-backup-${day}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setBackupMsg("Backup archive downloaded successfully.");
    } catch (e) {
      setBackupMsg("Download failed: " + (e.message || String(e)));
    } finally {
      setBackupBusy(false);
    }
  };

  const backupNow = async () => {
    setBackupBusy(true);
    setBackupMsg("");
    try {
      const res = await api.backupRun();
      setBackupMsg(`Created ${res.file} (${(res.bytes / 1024).toFixed(1)} KB)`);
      refreshBackups();
    } catch (e) {
      setBackupMsg("Backup failed: " + (e.message || String(e)));
    } finally {
      setBackupBusy(false);
    }
  };

  const setMode = async (mode) => {
    try {
      const updated = await api.updateSettings({ backup_mode: mode });
      setSettings(updated);
    } catch (e) {
      setBackupMsg("Failed to save mode: " + (e.message || String(e)));
    }
  };

  const importFile = async (file) => {
    if (!file) return;
    if (
      !window.confirm(
        "Restore will REPLACE tracking, favorites, playlists, chapters and comments with the backup contents. Continue?"
      )
    )
      return;
    setBackupBusy(true);
    setBackupMsg("");
    try {
      const text = await file.text();
      const doc = JSON.parse(text);
      const res = await api.backupImport(doc);
      const r = res.restored || {};
      setBackupMsg(
        `Restored: ${r.tracking || 0} tracking, ${r.favorites || 0} favorites, ${
          r.playlists || 0
        } playlists, ${r.timestamps || 0} chapters, ${r.comments || 0} comments, ${
          r.collections || 0
        } collections.`
      );
    } catch (e) {
      setBackupMsg("Import failed: " + (e.message || String(e)));
    } finally {
      setBackupBusy(false);
    }
  };

  const currentLib = (settings && settings.library_path) || libraryPath || "<library>";
  const rows = [
    ["App", "PersonalFlix"],
    ["Version", "1.0.0"],
    ["Server", "127.0.0.1:31731"],
    ["Server Status", statusText],
    ["Active Library Path", currentLib],
    ["Database", "%APPDATA%/PersonalFlix/app.db"],
    ["Settings", "%APPDATA%/PersonalFlix/settings.json"],
    ["Thumbnails", `${currentLib}/netflix-app/backend/public/thumbnails`],
    ["Performers", `${currentLib}/performers`],
  ];

  return (
    <div className="h-full bg-[#070708] pt-6 px-10 overflow-y-auto select-none custom-scrollbar">
      <div className="max-w-3xl pb-20 mx-auto">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display uppercase tracking-[0.2em] text-2xl font-black text-white">
              Settings
            </h1>
            <p className="text-xs text-zinc-500 font-mono mt-1">
              Configuration, environment variables, and data backups
            </p>
          </div>

          {/* Server Health Badge */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/80 border border-white/10 backdrop-blur-md shadow-lg">
            <span
              className={`w-2 h-2 rounded-full ${
                isOk ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="text-[11px] font-mono font-medium text-zinc-300">
              {statusText}
            </span>
          </div>
        </div>

        {/* 1. Media Library Configuration Card */}
        <MediaLibraryCard
          libraryPath={libraryPath}
          setLibraryPath={setLibraryPath}
          handleSave={handleSave}
          saving={saving}
          savedMsg={savedMsg}
        />

        {/* 2. System Diagnostics Table */}
        <SystemDiagnosticsCard
          rows={rows}
          onScanHealth={() => navigate(ROUTES.HEALTH)}
        />

        {/* 3. Display & Light Blocker Card */}
        <DisplayCard />

        {/* 4. Captions & Transcription Card */}
        <CaptionsCard settings={settings} onSettings={setSettings} />

        <div className="h-6" />

        {/* 5. Backup & Data Management Card */}
        <BackupsCard
          lastBackup={lastBackup}
          downloadBackup={downloadBackup}
          backupNow={backupNow}
          importFile={importFile}
          backupBusy={backupBusy}
          settings={settings}
          setMode={setMode}
          backupMsg={backupMsg}
          backups={backups}
        />

        {/* Footer info */}
        <div className="mt-8 flex items-center justify-between text-[11px] font-mono text-zinc-600 px-2">
          <span>PersonalFlix Desktop • Tauri 2.0 • SQLite</span>
          <span>Engine Status: Verified</span>
        </div>
      </div>
    </div>
  );
}
