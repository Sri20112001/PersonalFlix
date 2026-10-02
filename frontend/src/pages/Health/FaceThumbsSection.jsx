import React, { useEffect, useRef, useState } from "react";
import { api } from "../../api/apiClient";

// Face-aware thumbnails: for scenes missing a thumbnail, scan candidate
// frames with uniface/SCRFD and keep the frame with the largest confident
// face. Runs sequentially (one CPU-saturating inference at a time).
export default function FaceThumbsSection({ missingIds = [], onChanged }) {
  const [engine, setEngine] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // {done,total,current,faces,failed}
  const [log, setLog] = useState([]);
  const stopRef = useRef(false);

  useEffect(() => {
    api.facesStatus().then(setEngine).catch(() => setEngine({ available: false }));
  }, []);

  const smartFill = async () => {
    if (running || missingIds.length === 0) return;
    if (
      !window.confirm(
        `Generate face-aware thumbnails for ${missingIds.length} scene(s)?\n\nEach video is scanned for the best face frame. This saturates the CPU for a while — roughly a minute per long video.`
      )
    )
      return;
    stopRef.current = false;
    setRunning(true);
    setLog([]);
    let failed = 0;
    for (let i = 0; i < missingIds.length; i++) {
      if (stopRef.current) break;
      const id = missingIds[i];
      setProgress({ done: i, total: missingIds.length, current: id, failed });
      try {
        const res = await api.smartThumb(id);
        if (res?.ok === false) throw new Error(res?.error || "sidecar failed");
        setLog((prev) =>
          [
            `#${id}: ${res?.fallback ? "no face — middle frame" : `${res?.faces ?? 0} face(s)`}`,
            ...prev,
          ].slice(0, 30)
        );
      } catch (e) {
        failed += 1;
        setLog((prev) => [`#${id}: FAILED (${e.message || e})`, ...prev].slice(0, 30));
      }
      setProgress({ done: i + 1, total: missingIds.length, current: id, failed });
    }
    setRunning(false);
    onChanged && onChanged();
  };

  return (
    <div className="mb-6 rounded-2xl bg-zinc-950/70 backdrop-blur-xl border border-white/10 p-5 shadow-xl">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-200">
            Face-Aware Thumbnails
          </h2>
        </div>
        {engine && (
          <span className="text-[10px] text-zinc-500 font-mono">
            {engine.available
              ? `uniface ${engine.uniface || ""} · ${engine.python || ""}`.trim()
              : "engine not installed"}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
        Missing thumbnails get the frame with the largest, most confident face
        instead of a blind 10-second grab.{" "}
        {missingIds.length > 0 ? (
          <span className="text-zinc-200 font-bold">{missingIds.length} missing.</span>
        ) : (
          <span>Nothing missing right now.</span>
        )}
      </p>

      {!engine ? (
        <div className="text-xs font-mono text-zinc-500">Checking face engine…</div>
      ) : !engine.available ? (
        <div className="text-xs font-mono text-amber-300 leading-relaxed">
          Face engine not ready ({engine.hint || "run scripts/face_thumbs/setup.ps1"}).
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={smartFill}
            disabled={running || missingIds.length === 0}
            className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-zinc-950 bg-accent hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {running ? "Working…" : `Smart-fill ${missingIds.length} missing`}
          </button>
          {running && (
            <button
              onClick={() => (stopRef.current = true)}
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/10 transition-all cursor-pointer"
            >
              Stop after current
            </button>
          )}
          {progress && (
            <span className="text-xs font-mono text-zinc-400">
              {progress.done}/{progress.total}
              {running ? ` · #${progress.current}` : " · done"}
              {progress.failed > 0 && (
                <span className="text-rose-300"> · {progress.failed} failed</span>
              )}
            </span>
          )}
        </div>
      )}

      {running && progress && progress.total > 0 && (
        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto custom-scrollbar text-[11px] font-mono text-zinc-500 leading-relaxed">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
