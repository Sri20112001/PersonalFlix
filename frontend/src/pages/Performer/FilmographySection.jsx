import React, { useMemo, useState } from "react";
import VideoCard from "../../components/VideoCard";
import CareerAnalyticsDashboard from "./CareerAnalyticsDashboard";
import { formatTotalDuration } from "../../utilities/formatters";
import { GridIcon, ListIcon } from "../../utilities/icons";

export default function FilmographySection({
  rawScenes = [],
  filteredScenes = [],
  totalScenesCount = 0,
  stats = null,
  yearBreakdown = [],
  selectedYear = "all",
  onSelectYear,
  selectedCoStar = null,
  onClearCoStar,
  selectedStudio = "all",
  onSelectStudio,
  studios = [],
  selectedResolution = "all",
  onSelectResolution,
  sceneSearch = "",
  setSceneSearch,
  sceneSort = "recent",
  setSceneSort,
  onResetAllFilters,
}) {
  const [viewMode, setViewMode] = useState("grouped"); // "grouped" | "grid"

  // Group filtered scenes chronologically by release year for the grouped view
  const groupedScenes = useMemo(() => {
    if (viewMode !== "grouped") return [];

    const map = new Map();
    filteredScenes.forEach((s) => {
      const yr =
        s.date && /^\d{4}/.test(String(s.date))
          ? String(s.date).slice(0, 4)
          : "Undated Releases";

      if (!map.has(yr)) {
        map.set(yr, {
          year: yr,
          scenes: [],
          totalDuration: 0,
        });
      }
      const group = map.get(yr);
      group.scenes.push(s);
      group.totalDuration += s.duration || 0;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.year === "Undated Releases") return 1;
      if (b.year === "Undated Releases") return -1;
      return b.year.localeCompare(a.year);
    });
  }, [filteredScenes, viewMode]);

  const scenesForAnalytics = rawScenes.length > 0 ? rawScenes : filteredScenes;

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Full Career Analytics Dashboard & Telemetry */}
      <CareerAnalyticsDashboard
        scenes={scenesForAnalytics}
        studios={studios}
        stats={stats}
        selectedYear={selectedYear}
        onSelectYear={onSelectYear}
        selectedStudio={selectedStudio}
        onSelectStudio={onSelectStudio}
      />

      {/* 2. Filmography Catalog Section */}
      <div className="flex flex-col gap-5">
        {/* Active Filter Chips */}
        {(selectedCoStar ||
          selectedYear !== "all" ||
          selectedStudio !== "all" ||
          selectedResolution !== "all" ||
          sceneSearch) && (
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            <span className="text-zinc-500">Active filters:</span>
            {selectedCoStar && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-accent/15 border border-accent/30 text-accent shadow-sm">
                <span>Co-Star: {selectedCoStar.name}</span>
                <button
                  type="button"
                  onClick={onClearCoStar}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </span>
            )}
            {selectedYear !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 shadow-sm">
                <span>Year: {selectedYear}</span>
                <button
                  type="button"
                  onClick={() => onSelectYear("all")}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </span>
            )}
            {selectedStudio !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.06] border border-white/10 text-zinc-300 shadow-sm">
                <span>
                  Studio:{" "}
                  {studios.find((s) => s._id === selectedStudio)?.name ||
                    selectedStudio}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectStudio("all")}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </span>
            )}
            {selectedResolution !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.06] border border-white/10 text-zinc-300 shadow-sm">
                <span>Res: {selectedResolution.toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => onSelectResolution("all")}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </span>
            )}
            {sceneSearch && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.06] border border-white/10 text-zinc-300 shadow-sm">
                <span>Query: "{sceneSearch}"</span>
                <button
                  type="button"
                  onClick={() => setSceneSearch("")}
                  className="hover:text-white cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={onResetAllFilters}
              className="text-zinc-400 hover:text-rose-400 underline ml-1 cursor-pointer transition-colors"
            >
              Reset All
            </button>
          </div>
        )}

        {/* Scenes Header & Search / Sort / View Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-display uppercase tracking-widest text-xl text-white font-bold">
              Filmography Catalog ({filteredScenes.length})
            </h2>
            {selectedYear !== "all" && (
              <span className="text-xs font-mono text-zinc-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                {selectedYear} Era
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
            {/* View Mode Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                title="Chronological Era View (Grouped by Year)"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "grouped"
                    ? "bg-accent text-zinc-950 shadow-sm font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <ListIcon size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title="Flat Grid View"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-accent text-zinc-950 shadow-sm font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <GridIcon size={15} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-60">
              <input
                type="text"
                value={sceneSearch}
                onChange={(e) => setSceneSearch(e.target.value)}
                placeholder="Search filmography..."
                className="w-full bg-white/[0.04] focus:bg-white/[0.07] border border-white/10 focus:border-accent rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 outline-none transition-all duration-200 shadow-inner"
              />
              {sceneSearch && (
                <button
                  onClick={() => setSceneSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Select */}
            <div className="relative">
              <select
                value={sceneSort}
                onChange={(e) => setSceneSort(e.target.value)}
                className="bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 focus:border-accent rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-200 outline-none cursor-pointer transition-all appearance-none pr-8"
              >
                <option value="recent" className="bg-zinc-900 text-zinc-200">
                  Recently Added
                </option>
                <option value="date-desc" className="bg-zinc-900 text-zinc-200">
                  Release Date (Newest)
                </option>
                <option value="date-asc" className="bg-zinc-900 text-zinc-200">
                  Release Date (Oldest)
                </option>
                <option value="title-asc" className="bg-zinc-900 text-zinc-200">
                  Title (A–Z)
                </option>
                <option value="duration-desc" className="bg-zinc-900 text-zinc-200">
                  Duration (Longest)
                </option>
                <option value="size-desc" className="bg-zinc-900 text-zinc-200">
                  File Size
                </option>
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-[10px]">
                ▼
              </div>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {filteredScenes.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            {sceneSearch
              ? "No scenes matched your search query."
              : "No scenes available for this performer."}
          </div>
        ) : viewMode === "grouped" ? (
          /* 3A. Chronological Era-Grouped Catalog */
          <div className="flex flex-col gap-10">
            {groupedScenes.map((group) => (
              <div key={group.year} className="flex flex-col gap-4">
                {/* Year Header */}
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-xl font-black tracking-wide text-white">
                      {group.year}
                    </span>
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 shadow-[0_0_10px_rgba(245,179,1,0.15)]">
                      {group.scenes.length}{" "}
                      {group.scenes.length === 1 ? "release" : "releases"}
                    </span>
                    {group.totalDuration > 0 && (
                      <span className="text-xs font-mono text-zinc-400 hidden sm:inline-block">
                        • {formatTotalDuration(group.totalDuration)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectYear(group.year)}
                    className="text-[11px] font-mono text-zinc-400 hover:text-accent transition-colors cursor-pointer"
                  >
                    Focus {group.year} →
                  </button>
                </div>

                {/* Grid for this specific year */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {group.scenes.map((s) => (
                    <VideoCard
                      key={s._id}
                      scene={s}
                      width="100%"
                      height={160}
                      showProgress={true}
                      progress={s.progress}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* 3B. Classic Flat Grid Catalog */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredScenes.map((s) => (
              <VideoCard
                key={s._id}
                scene={s}
                width="100%"
                height={160}
                showProgress={true}
                progress={s.progress}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

