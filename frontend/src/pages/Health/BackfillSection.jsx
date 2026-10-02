import React from "react";

export default function BackfillSection({
  backfill = null,
  backfillBusy = false,
  backfillPhotos = true,
  setBackfillPhotos,
  backfillFilenames = true,
  setBackfillFilenames,
  onPreviewBackfill,
  onApplyBackfill,
}) {
  return (
    <div className="mb-6 bg-zinc-950/70 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <h2 className="font-display uppercase tracking-widest text-xs font-bold text-zinc-300">
          Performer Backfill
        </h2>
      </div>
      <p className="text-[11px] text-zinc-500 font-mono mb-3">
        Scenes with performer names but no links, verified against model pages. Preview first —
        only verified names are linked, the rest are skipped, never guessed.
      </p>
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={onPreviewBackfill}
          disabled={backfillBusy}
          className="px-5 py-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-zinc-200 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          {backfillBusy ? "Working…" : "Preview"}
        </button>
        <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono cursor-pointer select-none">
          <input
            type="checkbox"
            checked={backfillPhotos}
            onChange={(e) => setBackfillPhotos(e.target.checked)}
            className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
          />
          include missing photos
        </label>
        <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono cursor-pointer select-none" title="Parse performer names out of descriptive filenames for scenes with empty performer lists">
          <input
            type="checkbox"
            checked={backfillFilenames}
            onChange={(e) => setBackfillFilenames(e.target.checked)}
            className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
          />
          parse empty filenames
        </label>
        <button
          onClick={onApplyBackfill}
          disabled={backfillBusy || !(backfill?.plan || []).some((p) => p.verified)}
          className="px-5 py-2.5 rounded-xl bg-accent hover:brightness-110 text-white font-bold text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          Apply Links
        </button>
        {backfill && backfill.dry_run && (
          <span className="self-center text-[11px] text-zinc-400 font-mono">
            {backfill.verifiable}/{backfill.missing_names} names verifiable · {backfill.scenes_would_link} scene links
            {backfill.photos_missing > 0 && ` · ${backfill.photos_available}/${backfill.photos_missing} photos found`}
            {backfill.filename_scenes > 0 && ` · ${backfill.filename_scenes} filename scenes / ${backfill.filename_links || 0} links`}
          </span>
        )}
      </div>
      {backfill?.state && (
        <div className="mt-3 text-xs font-mono">
          {backfill.state === "done" || backfill.message ? (
            <div className={backfill.state === "error" ? "text-rose-400" : "text-emerald-400"}>
              {backfill.message || backfill.state}
              {backfill.state === "done" && " — reloading…"}
            </div>
          ) : (
            <div className="text-zinc-400 animate-pulse">
              {backfill.title ? `checking ${backfill.title}…` : "backfill running…"}
            </div>
          )}
        </div>
      )}
      {(backfill?.plan || []).filter((p) => p.verified && p.kind !== "photo").slice(0, 12).map((p) => (
        <div key={p.slug} className="mt-1.5 text-[11px] font-mono text-zinc-400">
          <span className="text-emerald-400">✓</span> {p.name}{" "}
          <span className="text-zinc-600">→ {p.scenes.length} scene(s)</span>
        </div>
      ))}
      {(backfill?.plan || []).filter((p) => p.verified && p.kind === "photo" && p.avatar_url).map((p) => (
        <div key={`ph-${p.slug}`} className="mt-1.5 text-[11px] font-mono text-zinc-400">
          <span className="text-sky-400">▣</span> {p.name}{" "}
          <span className="text-zinc-600">→ photo</span>
        </div>
      ))}
      {(backfill?.filename_plan || []).slice(0, 10).map((f) => (
        <div key={f.scene_id} className="mt-1.5 text-[11px] font-mono text-zinc-400">
          <span className="text-violet-400">▤</span> {f.title_fix || f.file_name}{" "}
          <span className="text-zinc-600">
            → {[...f.known.map(([n]) => n), ...f.verified].join(", ") || "no links"}
          </span>
        </div>
      ))}
      {(backfill?.plan || []).filter((p) => !p.verified).slice(0, 8).map((p) => (
        <div key={p.slug} className="mt-1.5 text-[11px] font-mono text-zinc-600">
          <span className="text-rose-400">·</span> {p.name} — unverifiable, skipped
        </div>
      ))}
    </div>
  );
}
