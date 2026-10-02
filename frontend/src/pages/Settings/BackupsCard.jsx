import React from "react";

export default function BackupsCard({
  lastBackup,
  downloadBackup,
  backupNow,
  importFile,
  backupBusy,
  settings,
  setMode,
  backupMsg,
  backups,
}) {
  return (
    <div className="bg-zinc-950/70 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-200">
            Backups &amp; Snapshots
          </h2>
        </div>
        {lastBackup && (
          <span className="text-[10px] text-zinc-500 font-mono">
            Last run: {lastBackup}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
        Exports capture watch timestamps, star ratings, customized bookmarks,
        playlists, favorites, and performer tags into a single portable document.
      </p>

      {/* Action Row: Glass Buttons */}
      <div className="flex items-center gap-2.5 flex-wrap mb-5">
        <button
          onClick={downloadBackup}
          disabled={backupBusy}
          className="bg-accent hover:brightness-110 disabled:opacity-50 text-zinc-950 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-accent/20 cursor-pointer active:scale-95"
        >
          Export JSON
        </button>

        <button
          onClick={backupNow}
          disabled={backupBusy}
          className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 hover:text-white disabled:opacity-50 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
        >
          {backupBusy ? "Processing..." : "Create Snapshot"}
        </button>

        <label className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 hover:text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95">
          Import Archive
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              importFile(e.target.files && e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* Automated Backup Schedule: Segmented Capsule */}
      <div className="flex items-center gap-3 py-3 border-t border-white/10">
        <span className="text-xs text-zinc-400 font-medium">Auto-Backup Frequency:</span>
        <div className="flex items-center bg-zinc-900/90 border border-white/10 rounded-xl p-1 gap-1">
          {["off", "daily", "weekly"].map((m) => {
            const active = (settings?.backup_mode || "off") === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  active
                    ? "bg-accent text-zinc-950 font-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {backupMsg && (
        <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-zinc-300">
          {backupMsg}
        </div>
      )}

      {/* Recent Backups List */}
      {backups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-2 font-mono">
            Existing Snapshots (Local Disk)
          </span>
          <div className="space-y-1.5">
            {backups.slice(0, 5).map((b) => (
              <div
                key={b.name}
                className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-white/5"
              >
                <span className="text-xs font-mono text-zinc-300 truncate">
                  {b.name}
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  {(b.bytes / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
