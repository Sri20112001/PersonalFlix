import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../api/apiClient";
import Spinner from "../../components/Spinner";
import { CheckIcon } from "../../utilities/icons";
import ReviewRow from "./ReviewRow";

const BUCKETS = [
  { key: "needs_performers", label: "Needs Performers" },
  { key: "needs_studio", label: "Needs Studio" },
  { key: "needs_both", label: "Needs Both" },
  { key: "needs_review", label: "Needs Review" },
];

const PAGE_SIZE = 25;

export default function Review() {
  const [bucket, setBucket] = useState("needs_performers");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [studios, setStudios] = useState([]);
  const [performers, setPerformers] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api
      .reviewQueue(bucket, page, PAGE_SIZE)
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [bucket, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .studios()
      .then(setStudios)
      .catch(() => {});
    api
      .performers()
      .then(setPerformers)
      .catch(() => {});
  }, []);

  const switchBucket = (b) => {
    setBucket(b);
    setPage(1);
    setExpanded(null);
  };

  const counts = data?.counts || {};

  return (
    <div className="h-full flex flex-col bg-[#070708] pt-20 px-8 pb-6 select-none overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
          <div>
            <h1 className="font-display uppercase tracking-[0.2em] text-xl font-black text-white">
              Metadata Review
            </h1>
            <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">
              Strict Verification Pipeline
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl px-4 py-3 shadow-lg flex-shrink-0 font-mono">
          {error}
        </div>
      )}

      {/* Queue Metric Cards: Frosted Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 flex-shrink-0">
        {BUCKETS.map((b) => {
          const n = counts[b.key] ?? "â€¦";
          const active = bucket === b.key;
          return (
            <button
              type="button"
              key={b.key}
              onClick={() => switchBucket(b.key)}
              className={`rounded-2xl p-4 text-left transition-all border backdrop-blur-xl cursor-pointer shadow-lg active:scale-95 ${
                active
                  ? "bg-accent/10 border-accent shadow-accent/10"
                  : "bg-zinc-950/70 border-white/10 hover:border-white/25 hover:bg-zinc-900/60"
              }`}
            >
              <div
                className={`text-2xl font-mono font-black tracking-tight ${
                  active ? "text-accent" : "text-white"
                }`}
              >
                {n}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-400 mt-1 font-mono font-bold">
                {b.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Review Cards List */}
      <div className="flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pb-6">
            {(data?.items || []).map((it) => (
              <ReviewRow
                key={it.sceneId}
                item={it}
                open={expanded === it.sceneId}
                onToggle={() => setExpanded(expanded === it.sceneId ? null : it.sceneId)}
                studios={studios}
                performers={performers}
                onSaved={() => {
                  setExpanded(null);
                  load();
                }}
              />
            ))}

            {/* Empty State Clean Card */}
            {(data?.items || []).length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 rounded-3xl border border-dashed border-white/10 bg-zinc-950/40 text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-emerald-400 shadow-inner">
                  <CheckIcon size={22} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                    Queue Cleared
                  </span>
                  <p className="text-xs text-zinc-500 font-mono">
                    All items in this verification category have canonical
                    assignments.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between pt-3 flex-shrink-0 text-xs text-zinc-400 border-t border-white/10 font-mono">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="uppercase tracking-wider hover:text-white disabled:opacity-30 px-3 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            â† Previous
          </button>
          <span className="text-[11px] text-zinc-500">
            Page <strong className="text-zinc-200">{data.page}</strong> of{" "}
            <strong className="text-zinc-200">{data.pages}</strong> Â·{" "}
            {data.total} items
          </span>
          <button
            type="button"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="uppercase tracking-wider hover:text-white disabled:opacity-30 px-3 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            Next â†’
          </button>
        </div>
      )}
    </div>
  );
}
