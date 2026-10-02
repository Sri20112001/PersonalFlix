import React from "react";

// ytmap.space-style bottom pill: round home button, expanding glass search
// with live result dropdown, round shuffle button. Scenes-only map, so the
// old Collaborations / Full Ecosystem switcher and node-type chips are gone.
export default function YtMapBar({
  searchQuery,
  setSearchQuery,
  matches,
  totalMatches,
  onSubmitSearch,
  onPickMatch,
  onHome,
  onRandom,
}) {
  return (
    <div className="ytmap-dock">
      <button className="ytmap-roundbtn" onClick={onHome} title="Fit all scenes" aria-label="Fit all scenes">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      </button>

      <div className="ytmap-searchwrap">
        <div className="ytmap-pill">
          <svg className="ytmap-searchicon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitSearch();
            }}
            placeholder="Search videos..."
            aria-label="Search scenes"
          />
          {searchQuery && (
            <button
              className="ytmap-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {searchQuery.trim() && (
          <div className="ytmap-results">
            <div className="ytmap-results-head">
              {totalMatches} result{totalMatches === 1 ? "" : "s"} — Enter to jump
            </div>
            {matches.map((m) => (
              <button key={m.id} onClick={() => onPickMatch(m, 2.6)}>
                <img src={m.thumb} alt="" onError={(e) => (e.target.style.display = "none")} />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="ytmap-roundbtn" onClick={onRandom} title="Random scene" aria-label="Random scene">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" />
          <path d="M4 20 21 3" />
          <path d="M21 16v5h-5" />
          <path d="m15 15 6 6" />
          <path d="M4 4l5 5" />
        </svg>
      </button>
    </div>
  );
}
