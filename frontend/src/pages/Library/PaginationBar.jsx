import React from "react";

function getPaginationItems(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function PaginationBar({
  total = 0,
  page = 1,
  totalPages = 1,
  pageSize = 48,
  loading = false,
  autoScroll = false,
  scenesCount = 0,
  jumpInput = "",
  setJumpInput,
  onJumpSubmit,
  onGoToPage,
  onScrollToTop,
}) {
  if (total <= 0) return null;

  return (
    <div className="w-full pt-8 pb-10 flex flex-col items-center gap-5 border-t border-white/10 mt-8 select-none">
      {/* Amazon "Back to Top" Action Bar */}
      <button
        onClick={onScrollToTop}
        className="w-full max-w-md py-2.5 px-4 rounded-xl bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-98 group"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-accent transition-transform group-hover:-translate-y-0.5"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
        <span>Back to Top</span>
      </button>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <button
            disabled={page <= 1 || loading}
            onClick={() => onGoToPage(page - 1)}
            className="px-3.5 py-2 rounded-lg bg-zinc-900 border border-white/10 hover:border-white/25 text-xs font-bold text-zinc-300 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
          >
            ← Previous
          </button>

          {getPaginationItems(page, totalPages).map((p, idx) =>
            p === "..." ? (
              <span key={`dots-${idx}`} className="px-2 text-zinc-500 font-mono text-xs">
                ...
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onGoToPage(p)}
                disabled={loading}
                className={`min-w-[36px] h-9 px-3 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  page === p
                    ? "bg-accent text-zinc-950 font-black shadow-lg shadow-accent/20 scale-105"
                    : "bg-zinc-900 text-zinc-300 hover:text-white border border-white/10 hover:border-white/30"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            disabled={page >= totalPages || loading}
            onClick={() => onGoToPage(page + 1)}
            className="px-3.5 py-2 rounded-lg bg-zinc-900 border border-white/10 hover:border-white/25 text-xs font-bold text-zinc-300 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
          >
            Next →
          </button>
        </div>
      )}

      {/* Jump to Page & Results Status */}
      <div className="flex items-center gap-4 text-xs text-zinc-400 font-mono flex-wrap justify-center">
        <span>
          Showing {autoScroll ? `1–${scenesCount}` : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)}`} of {total} scenes
        </span>
        {totalPages > 1 && (
          <>
            <span className="text-zinc-600">|</span>
            <form onSubmit={onJumpSubmit} className="flex items-center gap-2">
              <span>Go to page:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                placeholder={String(page)}
                className="w-14 px-2 py-1 rounded bg-zinc-900 border border-white/15 text-white text-center font-mono focus:border-accent outline-none text-xs"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-bold cursor-pointer transition-colors"
              >
                Go
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
