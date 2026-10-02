import React, { useEffect, useState } from "react";
import { api } from "../../api/apiClient";

function fmtBytes(n) {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(0)} ${units[i]}`;
}

// Whisper caption engine: pick which staged ggml model new transcriptions use.
// "auto" = largest English model on disk (recommended: small.en over base.en —
// small recovers whole lines base drops and segments speaker turns properly).
export default function CaptionsCard({ settings, onSettings }) {
  const [engine, setEngine] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [movePath, setMovePath] = useState("");
  const [moving, setMoving] = useState(false);

  const refreshEngine = async () => {
    try {
      setEngine(await api.transcribeEngine());
    } catch {
      setEngine({ available: false });
    }
  };

  useEffect(() => {
    refreshEngine();
  }, []);

  const current = settings?.whisper_model || engine?.preference || "auto";
  const models = engine?.models || [];
  const active = engine?.model_name || "";

  const pick = async (value) => {
    setSaving(true);
    setMsg("");
    try {
      const updated = await api.updateSettings({ whisper_model: value });
      onSettings && onSettings(updated);
      await refreshEngine();
      setMsg(`Caption model set to ${value}.`);
    } catch (e) {
      setMsg("Save failed: " + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const moveEngine = async () => {
    const dest = movePath.trim();
    if (!dest) {
      setMsg("Enter a destination folder first (e.g. P:\\AI\\whisper).");
      return;
    }
    if (
      !window.confirm(
        `Move the whisper engine (exe + all models) to:\n\n${dest}\n\nThe app will use the new location immediately. Continue?`
      )
    )
      return;
    setMoving(true);
    setMsg("");
    try {
      const res = await api.relocateEngine(dest);
      if (res?.error || res?.ok === false) throw new Error(res?.error || "move failed");
      const updated = await api.settings().catch(() => null);
      if (updated) onSettings && onSettings(updated);
      await refreshEngine();
      setMovePath("");
      setMsg(`Engine moved to ${res.root || dest} (${res.moved ?? 0} items).`);
    } catch (e) {
      const detail = String(e?.message || e).startsWith("409")
        ? "A transcription is running — wait for it to finish and retry."
        : e.message || String(e);
      setMsg("Move failed: " + detail);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="bg-zinc-950/70 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-200">
            Captions &amp; Transcription
          </h2>
        </div>
        {engine?.available && active && (
          <span className="text-[10px] text-zinc-500 font-mono">
            Active: {active}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
        Local Whisper.cpp transcribes dialogue into sidecar captions. Larger
        models miss far fewer lines — if transcripts skip dialogue, switch to a
        larger model and re-generate the captions.
      </p>

      {/* Engine location: move the multi-GB exe + models off the system drive */}
      <div className="mb-5 rounded-xl bg-white/[0.03] border border-white/10 p-3.5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
          Engine location
        </div>
        <div className="text-[11px] font-mono text-zinc-300 break-all mb-2.5">
          {engine?.root || settings?.whisper_root || "…"}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={movePath}
            onChange={(e) => setMovePath(e.target.value)}
            placeholder="New folder, e.g. P:\AI\whisper"
            className="flex-1 min-w-0 bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder:text-zinc-600 outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={moveEngine}
            disabled={moving}
            className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider text-zinc-950 bg-accent hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 active:scale-95 flex-shrink-0"
            title="Move whisper-cli.exe and all models to the new folder"
          >
            {moving ? "Moving…" : "Move"}
          </button>
        </div>
        <div className="mt-1.5 text-[10px] font-mono text-zinc-600">
          Moves the exe + models, then uses the new location. Blocked while a transcription runs.
        </div>
      </div>

      {!engine ? (
        <div className="text-xs font-mono text-zinc-500">Checking engine…</div>
      ) : !engine.available ? (
        <div className="text-xs font-mono text-amber-300">
          Whisper engine not found in the folder above. Move a staged install
          there, or reinstall it.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-zinc-400 font-medium">Model:</span>
            <div className="flex items-center bg-zinc-900/90 border border-white/10 rounded-xl p-1 gap-1 flex-wrap">
              <button
                key="auto"
                onClick={() => pick("auto")}
                disabled={saving}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                  current === "auto"
                    ? "bg-accent text-zinc-950 font-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Auto
              </button>
              {models.map((m) => (
                <button
                  key={m.name}
                  onClick={() => pick(m.name)}
                  disabled={saving}
                  title={`${m.name} (${fmtBytes(m.bytes)})`}
                  className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                    current === m.name
                      ? "bg-accent text-zinc-950 font-black shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {m.name.replace("ggml-", "").replace(".bin", "")}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 text-[11px] font-mono text-zinc-500 leading-relaxed">
            {models.map((m) => (
              <div key={m.name}>
                {m.name} — {fmtBytes(m.bytes)}
                {m.name === active ? " ← in use" : ""}
              </div>
            ))}
          </div>
        </>
      )}

      {msg && (
        <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-zinc-300">
          {msg}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-white/10 text-[11px] font-mono text-zinc-500 leading-relaxed">
        Already-captioned scenes keep their old transcript until re-generated:
        open the scene and use the CC↻ button in the player, or select scenes
        in the Library and Shift+click 🎙 Captions for a force batch re-run.
      </div>
    </div>
  );
}
