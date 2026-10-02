import React from "react";

// Uiverse-styled toolbar: sliding-glider tabs, neon checkbox chips,
// glowing search box and icon buttons. Props & behavior unchanged.
export default function GraphToolbar({
  mode,
  setMode,
  showStudios,
  setShowStudios,
  showPerformers,
  setShowPerformers,
  showScenes,
  setShowScenes,
  minScenes,
  setMinScenes,
  searchQuery,
  setSearchQuery,
  searchOpen,
  setSearchOpen,
  searchResults,
  onSelectSearchResult,
  fitView,
  togglePause,
  isPaused,
}) {
  return (
    <div className="uv-scope absolute top-16 left-6 right-6 z-20 flex items-center justify-between flex-wrap gap-3 pointer-events-none">
      <div className="flex items-center gap-2.5 flex-wrap pointer-events-auto">
        {/* Mode Switcher — sliding glider tabs */}
        <div className="uv-tabs" data-active={mode === "full" ? "1" : "0"}>
          <span className="uv-glider" aria-hidden="true" />
          <button
            onClick={() => setMode("collab")}
            className={mode === "collab" ? "uv-on" : ""}
          >
            Collaborations
          </button>
          <button
            onClick={() => setMode("full")}
            className={mode === "full" ? "uv-on" : ""}
          >
            Full Ecosystem
          </button>
        </div>

        {/* Filter Pills — neon checkbox chips */}
        <div className="uv-chips">
          <label className="uv-chip uv-indigo">
            <input
              type="checkbox"
              checked={showStudios}
              onChange={() => setShowStudios((v) => !v)}
            />
            <span>
              <span className="uv-dot" />
              Studios
            </span>
          </label>
          <label className="uv-chip uv-amber">
            <input
              type="checkbox"
              checked={showPerformers}
              onChange={() => setShowPerformers((v) => !v)}
            />
            <span>
              <span className="uv-dot" />
              Performers
            </span>
          </label>
          {mode === "full" && (
            <label className="uv-chip uv-slate">
              <input
                type="checkbox"
                checked={showScenes}
                onChange={() => setShowScenes((v) => !v)}
              />
              <span>
                <span className="uv-dot" />
                Scenes
              </span>
            </label>
          )}
        </div>

        {/* Min Scenes Filter */}
        <div className="uv-selectwrap">
          <span>Min:</span>
          <select
            value={minScenes}
            onChange={(e) => setMinScenes(Number(e.target.value))}
          >
            <option value="1">All (1+)</option>
            <option value="2">2+ scenes</option>
            <option value="4">4+ scenes</option>
            <option value="8">8+ scenes</option>
          </select>
        </div>
      </div>

      {/* Right Search & Controls */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Search Node Input */}
        <div className="uv-search">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search graph..."
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          {searchQuery && (
            <button
              className="uv-clear"
              onClick={() => {
                setSearchQuery("");
                setSearchOpen(false);
              }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}

          {/* Dropdown Results */}
          {searchOpen && searchResults.length > 0 && (
            <div className="uv-menu">
              {searchResults.map((r) => (
                <button key={r.id} onClick={() => onSelectSearchResult(r)}>
                  <span
                    className="uv-mdot"
                    style={{
                      background:
                        r.type === "studio"
                          ? "#818CF8"
                          : r.type === "performer"
                          ? "#F5B301"
                          : "#94A3B8",
                      boxShadow: "0 0 6px currentColor",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white truncate font-medium">{r.name}</div>
                    <div className="text-[10px] text-textMuted uppercase font-mono">
                      {r.type} {r.scene_count ? `· ${r.scene_count} scenes` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recenter / Fit View */}
        <button
          onClick={fitView}
          className="uv-iconbtn"
          title="Fit All Nodes"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>

        {/* Pause / Resume Physics */}
        <button
          onClick={togglePause}
          className={`uv-iconbtn ${isPaused ? "uv-live" : ""}`}
          title={isPaused ? "Resume Simulation" : "Freeze Simulation"}
        >
          {isPaused ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
