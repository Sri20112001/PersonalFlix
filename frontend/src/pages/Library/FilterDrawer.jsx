import React from "react";

export default function FilterDrawer({
  open,
  studios = [],
  performers = [],
  categories = [],
  resolutions = ["480p", "720p", "1080p", "4k"],
  currentQuery = "",
  onAddFilterToken,
  onRemoveFilter,
  onClearAll,
}) {
  if (!open) return null;

  return (
    <div className="flex-shrink-0 mb-4 bg-surface border border-white/10 rounded-lg p-4 transition-all shadow-lg">
      <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
        <span className="text-xs font-bold uppercase tracking-widest text-textSecondary">
          Filter Collection
        </span>
        <button
          onClick={onClearAll}
          className="text-[11px] text-accent hover:underline uppercase tracking-wider font-semibold cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Studio Filter */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-textMuted mb-1">
            Studio
          </label>
          <select
            onChange={(e) => onAddFilterToken("studio", e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
            defaultValue=""
          >
            <option value="">All Studios</option>
            {studios.map((s) => (
              <option key={s._id || s.name} value={s.slug || s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Performer Filter */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-textMuted mb-1">
            Performer
          </label>
          <select
            onChange={(e) => onAddFilterToken("performer", e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
            defaultValue=""
          >
            <option value="">All Performers</option>
            {performers.map((p) => (
              <option key={p._id || p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-textMuted mb-1">
            Category
          </label>
          <select
            onChange={(e) => onAddFilterToken("category", e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
            defaultValue=""
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c._id || c.name} value={c.slug || c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tag Filter */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-textMuted mb-1">
            Tag
          </label>
          <input
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target.value.trim()) {
                onAddFilterToken("tag", e.target.value);
                e.target.value = "";
              }
            }}
            placeholder="e.g. blonde — Enter to add"
            spellCheck={false}
            className="w-full bg-black/50 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent placeholder:text-zinc-600"
          />
        </div>

        {/* Resolution Filter Pills */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-textMuted mb-1">
            Resolution
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {resolutions.map((r) => {
              const isActive = currentQuery.toLowerCase().includes(`resolution:${r}`);
              return (
                <button
                  key={r}
                  onClick={() =>
                    isActive
                      ? onRemoveFilter("resolution", r)
                      : onAddFilterToken("resolution", r)
                  }
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? "bg-accent text-white shadow-md"
                      : "bg-black/40 border border-white/10 text-textSecondary hover:text-white"
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
