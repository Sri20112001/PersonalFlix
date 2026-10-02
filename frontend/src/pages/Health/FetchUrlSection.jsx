import React from "react";
import { Link } from "react-router-dom";
import { fmtBytes } from "./healthUtils";
import { ROUTES } from "../../constants/routes";

export default function FetchUrlSection({
  fetchUrl = "",
  setFetchUrl,
  fetchRes = "480m",
  setFetchRes,
  fetchJob = null,
  onStartFetch,
}) {
  return (
    <div className="mb-6 bg-zinc-950/70 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <h2 className="font-display uppercase tracking-widest text-xs font-bold text-zinc-300">
          Fetch from URL
        </h2>
      </div>
      <p className="text-[11px] text-zinc-500 font-mono mb-3">
        Paste a video link — details are scraped, the file downloads into
        the studio folder, and the scene registers itself.
      </p>
      <div className="flex gap-2 flex-wrap">
        <input
          value={fetchUrl}
          onChange={(e) => setFetchUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onStartFetch()}
          placeholder="https://www.example.com/videos/12345/scene-name/"
          spellCheck={false}
          className="flex-1 min-w-[240px] bg-zinc-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-accent/60"
        />
        <select
          value={fetchRes}
          onChange={(e) => setFetchRes(e.target.value)}
          className="bg-zinc-900/80 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 font-mono focus:outline-none cursor-pointer"
        >
          {["480m", "480", "720m", "720p", "1080p"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          onClick={onStartFetch}
          disabled={!fetchUrl.trim() || fetchJob?.state === "queued" || fetchJob?.state === "downloading"}
          className="px-5 py-2.5 rounded-xl bg-accent hover:brightness-110 text-white font-bold text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          {fetchJob?.state === "downloading" || fetchJob?.state === "queued" ? "Fetching…" : "Fetch"}
        </button>
      </div>

      {fetchJob && fetchJob.url !== undefined && (
        <div className="mt-3 text-xs font-mono">
          {(fetchJob.state === "queued" || fetchJob.state === "downloading") && (
            <>
              <div className="flex justify-between text-zinc-400 mb-1.5">
                <span className="truncate">{fetchJob.title || fetchJob.url}</span>
                <span className="flex-shrink-0 ml-3">
                  {fetchJob.total
                    ? `${fmtBytes(fetchJob.bytes)} / ${fmtBytes(fetchJob.total)}`
                    : `${fmtBytes(fetchJob.bytes)}…`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: fetchJob.total
                      ? `${Math.min(100, (100 * fetchJob.bytes) / fetchJob.total).toFixed(1)}%`
                      : "30%",
                  }}
                />
              </div>
            </>
          )}
          {fetchJob.state === "done" && (
            <div className="text-emerald-400">
              Saved{fetchJob.message ? `: ${fetchJob.message}` : ""}{" "}
              {fetchJob.scene_id && (
                <Link to={ROUTES.scene(fetchJob.scene_id)} className="underline hover:text-emerald-300">
                  open scene →
                </Link>
              )}
            </div>
          )}
          {fetchJob.state === "error" && (
            <div className="text-rose-400">{fetchJob.message || "Fetch failed"}</div>
          )}
        </div>
      )}
    </div>
  );
}
