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

  useEffect(() => {
    api
      .transcribeEngine()
      .then(setEngine)
      .catch(() => setEngine({ available: false }));
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
      const st = await api.transcribeEngine();
      setEngine(st);
      setMsg(`Caption model set to ${value}. New transcriptions use ${st.model_name || value}.`);
    } catch (e) {
      setMsg("Save failed: " + (e.message || String(e)));
    } finally {
      setSaving(false);
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

      <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
        Local Whisper.cpp transcribes dialogue into sidecar captions. Larger
        models miss far fewer lines — if transcripts skip dialogue, switch to a
        larger model and re-generate the captions.
      </p>

      {!engine ? (
        <div className="text-xs font-mono text-zinc-500">Checking engine…</div>
      ) : !engine.available ? (
        <div className="text-xs font-mono text-amber-300">
          Whisper engine not found under %LOCALAPPDATA%/PersonalFlix/tools/whisper.
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
