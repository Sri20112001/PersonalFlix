import React from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "../../constants/routes";

export default function AuditTab({
  stats,
  cards = [],
  audit = null,
  recon = null,
  reconBusy = false,
  onPreviewRepair,
  onApplyRepair,
  pruning = false,
  onPrune,
  revealing = null,
  onReveal,
}) {
  return (
    <>
      {/* 1. Health Diagnostic Stat Pods */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        {cards.map(([label, value, good]) => (
          <div
            key={label}
            className="relative bg-zinc-950/70 border border-white/10 rounded-2xl p-3.5 backdrop-blur-xl flex flex-col justify-between shadow-lg overflow-hidden group hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 font-mono">
                {label}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  good ? "bg-emerald-400" : "bg-rose-400 animate-ping"
                }`}
              />
            </div>
            <div
              className={`text-2xl font-mono font-black tracking-tight ${
                good ? "text-white" : "text-rose-400"
              }`}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* 2. Relational Mapping Audit Terminal */}
      {audit && audit.summary && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h2 className="font-display uppercase tracking-widest text-xs font-bold text-zinc-300">
              Relational Mapping Audit
            </h2>
          </div>
          <div className="bg-zinc-950/70 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
            <div className="flex flex-wrap gap-2.5 mb-4">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                {audit.summary.complete ?? 0} Complete
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent font-mono text-xs font-bold">
                {audit.summary.partial ?? 0} Partial
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-400 font-mono text-xs font-bold">
                {audit.summary.orphan ?? 0} Orphan
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${
                  (audit.summary.reviewRequired || 0) > 0
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    : "bg-white/5 border-white/10 text-zinc-500"
                }`}
              >
                {audit.summary.reviewRequired ?? 0} Needs Review
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-3 border-t border-white/5 text-xs text-zinc-400 font-mono">
              <div>invalid performers: <span className="text-white font-bold">{audit.summary.invalidPerformerRefs ?? 0}</span></div>
              <div>reverse mismatches: <span className="text-white font-bold">{audit.summary.performerReverseMismatches ?? 0}</span></div>
              <div>studio drift: <span className="text-white font-bold">{(audit.summary.studioMissingId || 0) + (audit.summary.studioNameDrift || 0)}</span></div>
              <div>prefix collisions: <span className="text-white font-bold">{audit.summary.prefixCollisions ?? 0}</span></div>
              <div>unresolved files: <span className="text-white font-bold">{audit.summary.unresolvedFiles ?? 0}</span></div>
              <div>id types: <span className="text-white font-bold">{(audit.summary.typeMix || []).join(", ") || "—"}</span></div>
            </div>

            {(audit.samples?.reviewQueue || []).length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
                {(audit.samples.reviewQueue || []).slice(0, 8).map((r) => (
                  <div
                    key={r.sceneId}
                    className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/40 border border-white/5 hover:border-white/15 transition-all"
                  >
                    <Link
                      to={ROUTES.scene(r.sceneId)}
                      replace={true}
                      className="text-xs text-zinc-200 truncate flex-1 hover:text-accent font-medium"
                    >
                      {r.title || `Scene ${r.sceneId}`}
                    </Link>
                    <span className="text-[10px] text-rose-400 font-mono bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-500/20 flex-shrink-0">
                      {(r.reasons || []).join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Transactional Data Reconcile Card */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h2 className="font-display uppercase tracking-widest text-xs font-bold text-zinc-300">
              Automated Reconciliation
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPreviewRepair}
              disabled={reconBusy}
              className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white bg-zinc-900 border border-white/10 hover:border-white/25 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            >
              {reconBusy ? "Checking…" : "Preview Repair"}
            </button>
            {recon && !recon.applied && (
              <button
                onClick={onApplyRepair}
                disabled={reconBusy}
                className="text-[11px] font-bold uppercase tracking-wider text-zinc-950 bg-accent hover:brightness-110 px-3.5 py-1.5 rounded-xl transition-all shadow-md shadow-accent/20 disabled:opacity-50 cursor-pointer"
              >
                Apply Repair
              </button>
            )}
          </div>
        </div>

        <div className="bg-zinc-950/70 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
          {recon ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono text-zinc-400 mb-3">
                <div>relink: <span className="text-white font-bold">{recon.would_relink ?? 0}</span></div>
                <div>adopt: <span className="text-white font-bold">{recon.would_adopt ?? 0}</span></div>
                <div>normalize: <span className="text-white font-bold">{recon.would_normalize ?? 0}</span></div>
                <div>studio cache: <span className="text-white font-bold">{recon.would_update_studio ?? 0}</span></div>
                <div>performer cache: <span className="text-white font-bold">{recon.would_update_performers ?? 0}</span></div>
                <div>create: <span className="text-white font-bold">{recon.would_create ?? 0}</span></div>
                <div>review: <span className="text-rose-400 font-bold">{recon.review_required ?? 0}</span></div>
                <div>unresolved: <span className="text-white font-bold">{recon.unresolved ?? 0}</span></div>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono">
                {recon.applied
                  ? "✓ Successfully committed in single transaction."
                  : "Dry-run mode active. No disk or database changes have been applied."}
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-500 leading-relaxed">
              Reconciles placeholder entities, matches filename prefixes to seeded rows, and flushes display caches. Run Preview Repair to simulate changes without risk.
            </p>
          )}
        </div>
      </div>

      {/* 4. Missing Files Quarantine Drawer */}
      {stats && stats.missing > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <h2 className="font-display uppercase tracking-widest text-xs font-bold text-rose-400">
                Missing Disk References ({stats.missing})
              </h2>
            </div>
            <button
              onClick={() => onPrune(null)}
              disabled={pruning}
              className="text-[11px] font-bold uppercase tracking-wider text-rose-400 hover:text-white bg-rose-950/30 border border-rose-500/30 hover:bg-rose-900/50 px-3 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {pruning ? "Pruning…" : "Prune All Missing"}
            </button>
          </div>

          <div className="bg-zinc-950/70 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5 backdrop-blur-xl shadow-xl">
            {(stats.missingFiles || []).map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-2.5 gap-4 hover:bg-white/[0.02]">
                <Link to={ROUTES.scene(m.id)} replace={true} className="text-xs text-zinc-200 truncate flex-1 hover:text-accent font-medium">
                  {m.title || `Scene ${m.id}`}
                </Link>
                <span className="text-xs text-rose-400/80 font-mono truncate max-w-[40%]">{m.filePath}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onReveal({ scene_id: m.id }, `miss-${m.id}`)}
                    disabled={revealing === `miss-${m.id}`}
                    className="text-[10px] text-zinc-400 hover:text-white uppercase font-bold tracking-wider px-2 py-1 rounded bg-white/5 cursor-pointer"
                  >
                    Locate
                  </button>
                  <button
                    onClick={() => onPrune([m.id])}
                    disabled={pruning}
                    className="text-[10px] text-rose-400 hover:text-white uppercase font-bold tracking-wider px-2 py-1 rounded hover:bg-rose-900/40 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Per-Studio Breakdown Dock */}
      {stats && Array.isArray(stats.studios) && stats.studios.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <h2 className="font-display uppercase tracking-widest text-xs font-bold text-zinc-300">
              Studio Catalog Distribution
            </h2>
          </div>
          <div className="bg-zinc-950/70 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5 backdrop-blur-xl shadow-xl">
            {stats.studios.map((s) => (
              <div
                key={s.studioId || s.studio}
                className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0 flex-1 pr-4">
                  {s.studioId ? (
                    <Link to={ROUTES.studio(s.studioId)} className="text-xs font-semibold text-zinc-200 hover:text-accent truncate block">
                      {s.studio || s.studioId}
                    </Link>
                  ) : (
                    <span className="text-xs text-zinc-400 truncate block">{s.studio || "(Untagged)"}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-zinc-400">{s.scenes} scenes</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold ${
                      s.missing > 0
                        ? "bg-rose-950/40 border border-rose-500/30 text-rose-400"
                        : "bg-emerald-950/30 border border-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {s.missing > 0 ? `${s.missing} missing` : "Verified"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
