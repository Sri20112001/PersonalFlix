import React from "react";
import SurpriseMeButton from "../../components/SurpriseMeButton";

const DEFAULT_TABS = [
  { key: "", label: "All" },
  { key: "want-to-watch", label: "Want to Watch" },
  { key: "watching", label: "Watching" },
  { key: "watched", label: "Watched" },
  { key: "skip", label: "Skipped" },
];

const DEFAULT_SORT_OPTIONS = [
  { key: "recent", label: "Recently Added" },
  { key: "fav_first", label: "Favorites First" },
  { key: "title_asc", label: "Title (A → Z)" },
  { key: "title_desc", label: "Title (Z → A)" },
  { key: "date_desc", label: "Release Date (Newest)" },
  { key: "date_asc", label: "Release Date (Oldest)" },
  { key: "size_desc", label: "File Size (Largest)" },
  { key: "random", label: "Random Shuffle" },
];

export default function LibraryHeader({
  total = 0,
  stats = { total: 0, studios: 0, watched: 0 },
  onSurpriseMe,
  query = "",
  onQueryChange,
  isSearch = false,
  onClearQuery,
  onSaveCollection,
  filters = [],
  onRemoveFilter,
  tab = "",
  onTabChange,
  tabs = DEFAULT_TABS,
  favOnly = false,
  onToggleFavOnly,
  filterDrawerOpen = false,
  onToggleFilterDrawer,
  sort = "recent",
  onSortChange,
  sortOptions = DEFAULT_SORT_OPTIONS,
  autoScroll = true,
  onToggleAutoScroll,
  mode = "grid",
  onModeChange,
  selectMode = false,
  onToggleSelectMode,
}) {
  return (
    <>
      {/* Top Header & Stats */}
      <div className="flex items-end justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="font-display uppercase tracking-wider text-2xl font-bold text-white">
            Library
          </h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-textSecondary uppercase tracking-widest font-mono">
            <span>{stats.total || total} Scenes</span>
            <span>·</span>
            <span>{stats.studios} Studios</span>
            <span>·</span>
            <span>{stats.watched} Watched</span>
          </div>
        </div>

        {/* Surprise Me button */}
        <SurpriseMeButton title="Suprise Me" onClick={onSurpriseMe} />
      </div>

      {/* Search Input */}
      <div className="flex-shrink-0 mb-3">
        <div className="flex items-center gap-3 bg-surface border border-white/10 rounded px-4 py-2.5 focus-within:border-accent transition-colors shadow-inner">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#A1A1AA"
            strokeWidth="2"
            className="flex-shrink-0"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder='Search title, studio:foo, fav:yes, resolution:720, performer:"Jane Doe", status:watched...'
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-textMuted"
          />
          {isSearch && (
            <button
              onClick={onClearQuery}
              className="text-textMuted hover:text-white text-xs uppercase tracking-widest flex-shrink-0"
            >
              Clear
            </button>
          )}
          {isSearch && onSaveCollection && (
            <button
              onClick={onSaveCollection}
              className="text-accent hover:text-white text-xs uppercase tracking-widest flex-shrink-0"
              title="Save this query as a smart collection"
            >
              Save
            </button>
          )}
        </div>

        {/* Active Filter Badges */}
        {filters.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {filters.map((f, i) => (
              <button
                key={`${f.field}-${f.value}-${i}`}
                onClick={() => onRemoveFilter(f.field, f.value)}
                className="flex items-center gap-1.5 bg-accent/15 border border-accent/40 text-accent pl-2.5 pr-1.5 py-1 rounded text-[11px] font-bold uppercase tracking-widest hover:bg-accent/25 transition-colors cursor-pointer"
                title="Remove filter"
              >
                <span>
                  {f.field}: {f.value}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar: Status Tabs & Controls */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0 border-b border-white/10 pb-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={`text-xs font-bold uppercase tracking-widest pb-1 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key
                  ? "text-white border-b-2 border-accent"
                  : "text-textSecondary hover:text-white border-b-2 border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Right Controls: Favorites Toggle, Filter Toggle, Sort Dropdown, View Mode */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Favorites-Only Toggle */}
          <button
            onClick={onToggleFavOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer ${
              favOnly
                ? "bg-amber-300 text-zinc-950 shadow-[0_0_16px_rgba(252,211,77,0.45)]"
                : "bg-surface hover:bg-surfaceHover text-textSecondary hover:text-white border border-white/10"
            }`}
            title="Show only favorited scenes"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill={favOnly ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span>Favorites</span>
          </button>

          {/* Filters Toggle Button */}
          <button
            onClick={onToggleFilterDrawer}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer ${
              filterDrawerOpen || filters.length > 0
                ? "bg-accent text-white shadow-md"
                : "bg-surface hover:bg-surfaceHover text-textSecondary hover:text-white border border-white/10"
            }`}
            title="Toggle filter panel"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Filters</span>
          </button>

          {/* Sort Selector */}
          <div className="relative flex items-center">
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-surface hover:bg-surfaceHover border border-white/10 text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded outline-none focus:border-accent cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option
                  key={opt.key}
                  value={opt.key}
                  className="bg-surface text-white"
                >
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Amazon-Style Scroll / Pages Toggle */}
          <div className="flex items-center bg-surface border border-white/10 rounded p-0.5 select-none">
            <button
              onClick={() => onToggleAutoScroll(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                autoScroll
                  ? "text-accent bg-accent/15 font-bold shadow-sm"
                  : "text-textSecondary hover:text-white"
              }`}
              title="Continuous Scroll: Stream pages automatically as you scroll down"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  autoScroll ? "bg-accent animate-pulse" : "bg-zinc-600"
                }`}
              />
              <span>Scroll</span>
            </button>
            <button
              onClick={() => onToggleAutoScroll(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                !autoScroll
                  ? "text-white bg-white/20 font-bold shadow-sm"
                  : "text-textSecondary hover:text-white"
              }`}
              title="Page by Page: Browse single pages with pagination bar"
            >
              <span>Pages</span>
            </button>
          </div>

          {/* Grid / List Mode Toggle */}
          <div className="flex items-center bg-surface border border-white/10 rounded p-0.5">
            <button
              onClick={() => onModeChange("grid")}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                mode === "grid"
                  ? "text-white bg-white/20"
                  : "text-textSecondary hover:text-white"
              }`}
              title="Grid View"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => onModeChange("list")}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                mode === "list"
                  ? "text-white bg-white/20"
                  : "text-textSecondary hover:text-white"
              }`}
              title="List View"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M4 5h16v2H4zM4 11h16v2H4zM4 17h16v2H4z" />
              </svg>
            </button>
          </div>

          {/* Multi-Select Toggle Button */}
          <button
            onClick={onToggleSelectMode}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              selectMode
                ? "bg-accent text-zinc-950 border-accent shadow-md shadow-accent/20"
                : "bg-surface text-zinc-400 hover:text-white border-white/10 hover:border-white/20"
            }`}
            title="Toggle Multi-Select Batch Editor"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>{selectMode ? "Done" : "Select"}</span>
          </button>
        </div>
      </div>
    </>
  );
}
