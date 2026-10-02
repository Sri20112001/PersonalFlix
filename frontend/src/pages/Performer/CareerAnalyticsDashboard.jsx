import React, { useMemo, useState } from "react";
import { formatTotalDuration } from "../../utilities/formatters";
import { SparklesIcon, FilmIcon, ClockIcon, CheckIcon } from "../../utilities/icons";

const STUDIO_COLORS = [
  "#F5B301", // Accent gold
  "#8B5CF6", // Purple
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#EC4899", // Pink
  "#F97316", // Orange
  "#64748B", // Slate for others
];

export default function CareerAnalyticsDashboard({
  scenes = [],
  studios = [],
  stats = null,
  selectedYear = "all",
  onSelectYear,
  selectedStudio = "all",
  onSelectStudio,
}) {
  const [hoveredYearData, setHoveredYearData] = useState(null);

  // Compute Career Timeline & Histogram Data
  const analytics = useMemo(() => {
    if (!scenes || scenes.length === 0) return null;

    const yearMap = new Map();
    const studioMap = new Map();
    let totalSec = 0;
    let watchedCount = 0;
    let res4k = 0;
    let res1080 = 0;

    scenes.forEach((s) => {
      // Duration
      if (s.duration && s.duration > 0) {
        totalSec += s.duration;
      }

      // Watched progress
      if (s.status === "watched" || (s.progress && s.progress >= 0.9)) {
        watchedCount += 1;
      }

      // Resolution
      const res = (s.resolution || "").toLowerCase();
      if (res.includes("4k") || res.includes("2160")) res4k += 1;
      else if (res.includes("1080")) res1080 += 1;

      // Studio
      const sId = s.studio_id || s.studio;
      if (sId) {
        const sName = s.studio || studios.find((st) => st._id === sId)?.name || sId;
        const cur = studioMap.get(sId) || { id: sId, name: sName, count: 0, duration: 0 };
        cur.count += 1;
        cur.duration += s.duration || 0;
        studioMap.set(sId, cur);
      }

      // Year
      if (s.date) {
        const y = String(s.date).slice(0, 4);
        if (/^\d{4}$/.test(y)) {
          const cur = yearMap.get(y) || {
            year: y,
            count: 0,
            duration: 0,
            watched: 0,
            studios: new Map(),
          };
          cur.count += 1;
          cur.duration += s.duration || 0;
          if (s.status === "watched" || (s.progress && s.progress >= 0.9)) {
            cur.watched += 1;
          }
          if (sId) {
            const sName = s.studio || sId;
            cur.studios.set(sName, (cur.studios.get(sName) || 0) + 1);
          }
          yearMap.set(y, cur);
        }
      }
    });

    // Chronological years (oldest to newest for visual timeline)
    const chronologicalYears = Array.from(yearMap.values()).sort((a, b) =>
      a.year.localeCompare(b.year)
    );

    // Peak year calculation
    let peakYear = null;
    let peakCount = 0;
    chronologicalYears.forEach((y) => {
      if (y.count > peakCount) {
        peakCount = y.count;
        peakYear = y.year;
      }
    });

    // Top studios sorted by scene count
    const sortedStudios = Array.from(studioMap.values()).sort((a, b) => b.count - a.count);
    const topStudios = sortedStudios.slice(0, 5);
    const remainingStudios = sortedStudios.slice(5);
    const othersCount = remainingStudios.reduce((acc, curr) => acc + curr.count, 0);

    const studioDistribution = topStudios.map((st, i) => ({
      ...st,
      color: STUDIO_COLORS[i % (STUDIO_COLORS.length - 1)],
      pct: scenes.length > 0 ? (st.count / scenes.length) * 100 : 0,
    }));

    if (othersCount > 0) {
      studioDistribution.push({
        id: "others",
        name: "Other Studios",
        count: othersCount,
        color: STUDIO_COLORS[STUDIO_COLORS.length - 1],
        pct: (othersCount / scenes.length) * 100,
      });
    }

    const debutYear = chronologicalYears.length > 0 ? chronologicalYears[0].year : null;
    const latestYear =
      chronologicalYears.length > 0
        ? chronologicalYears[chronologicalYears.length - 1].year
        : null;

    const spanYears =
      debutYear && latestYear
        ? Math.max(1, parseInt(latestYear, 10) - parseInt(debutYear, 10) + 1)
        : null;

    const effectiveWatched = stats?.watched_count ?? watchedCount;
    const effectiveTotal = scenes.length;
    const completionPct =
      effectiveTotal > 0 ? Math.round((effectiveWatched / effectiveTotal) * 100) : 0;
    const effectiveDuration = stats?.total_duration ?? totalSec;

    return {
      chronologicalYears,
      peakYear,
      peakCount,
      debutYear,
      latestYear,
      spanYears,
      studioDistribution,
      uniqueStudiosCount: studioMap.size,
      effectiveWatched,
      effectiveTotal,
      completionPct,
      effectiveDuration,
      res4k,
      res1080,
    };
  }, [scenes, studios, stats]);

  if (!analytics) return null;

  const {
    chronologicalYears,
    peakYear,
    peakCount,
    debutYear,
    latestYear,
    spanYears,
    studioDistribution,
    uniqueStudiosCount,
    effectiveWatched,
    effectiveTotal,
    completionPct,
    effectiveDuration,
  } = analytics;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/70 p-6 md:p-7 shadow-2xl backdrop-blur-xl">
      {/* Background glow ambiance */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-accent/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-purple-500/10 blur-[100px]" />

      {/* Header with Title & Reset */}
      <div className="relative z-10 flex items-center justify-between mb-6 pb-4 border-b border-white/[0.08] flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 text-accent shadow-[0_0_15px_rgba(245,179,1,0.2)]">
            <FilmIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-black uppercase tracking-wider text-white">
                Career Analytics & Filmography
              </h3>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-white/[0.06] text-accent border border-white/10">
                Live Telemetry
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Interactive release distribution, career trajectory, and studio insights
            </p>
          </div>
        </div>

        {(selectedYear !== "all" || selectedStudio !== "all") && (
          <button
            type="button"
            onClick={() => {
              onSelectYear("all");
              onSelectStudio("all");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-mono text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <span>Reset Timeline Filter</span>
            <span className="text-accent font-bold">✕</span>
          </button>
        )}
      </div>

      {/* 1. Career KPI Milestones Row */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-7">
        {/* Career Span */}
        <div className="flex flex-col p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1">
            <ClockIcon size={11} className="text-accent" />
            Career Span
          </span>
          <span className="text-lg font-display font-black text-white tracking-wide">
            {debutYear && latestYear ? `${debutYear} – ${latestYear}` : "N/A"}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">
            {spanYears ? `${spanYears} active ${spanYears === 1 ? "year" : "years"}` : "Unspecified"}
          </span>
        </div>

        {/* Peak Output Year */}
        <div className="flex flex-col p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1">
            <SparklesIcon size={11} className="text-purple-400" />
            Peak Year
          </span>
          <span className="text-lg font-display font-black text-purple-300 tracking-wide">
            {peakYear ? peakYear : "N/A"}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">
            {peakCount > 0
              ? `${peakCount} releases (${Math.round((peakCount / effectiveTotal) * 100)}%)`
              : "0 releases"}
          </span>
        </div>

        {/* Catalog Runtime */}
        <div className="flex flex-col p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1">
            <FilmIcon size={11} className="text-blue-400" />
            Total Duration
          </span>
          <span className="text-lg font-display font-black text-white tracking-wide">
            {formatTotalDuration(effectiveDuration)}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">
            {effectiveTotal} catalog {effectiveTotal === 1 ? "scene" : "scenes"}
          </span>
        </div>

        {/* Catalog Watch Completion */}
        <div className="flex flex-col p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1">
            <CheckIcon size={11} className="text-emerald-400" />
            Completion
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-display font-black text-emerald-300 tracking-wide">
              {completionPct}%
            </span>
            <span className="text-xs font-mono text-zinc-400">
              ({effectiveWatched}/{effectiveTotal})
            </span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>

        {/* Studio Footprint */}
        <div className="flex flex-col p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all col-span-2 sm:col-span-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1">
            <SparklesIcon size={11} className="text-amber-400" />
            Studios
          </span>
          <span className="text-lg font-display font-black text-white tracking-wide">
            {uniqueStudiosCount}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">Production partners</span>
        </div>
      </div>

      {/* 2. Interactive Year Histogram & Activity Timeline */}
      {chronologicalYears.length > 0 && (
        <div className="relative z-10 mb-7 p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/[0.07]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-300">
                Release Trajectory & Volume
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                (Click bar to focus era)
              </span>
            </div>

            {/* Quick stats on active or hovered year */}
            <div className="text-[11px] font-mono text-zinc-400">
              {hoveredYearData ? (
                <span className="text-accent animate-fade-in">
                  {hoveredYearData.year}: <strong className="text-white">{hoveredYearData.count}</strong> scenes ({formatTotalDuration(hoveredYearData.duration)}) • {hoveredYearData.watched} watched
                </span>
              ) : selectedYear !== "all" ? (
                <span className="text-accent">
                  Filtered to <strong className="text-white">{selectedYear}</strong> ({chronologicalYears.find((y) => y.year === selectedYear)?.count || 0} scenes)
                </span>
              ) : (
                <span>Showing all {effectiveTotal} releases</span>
              )}
            </div>
          </div>

          {/* Histogram Bars Container */}
          <div className="flex items-end gap-2.5 sm:gap-4 overflow-x-auto pb-2 pt-6 px-2 custom-scrollbar min-h-[160px]">
            {chronologicalYears.map((item) => {
              const isSelected = selectedYear === item.year;
              const isPeak = item.year === peakYear;
              const isDebut = item.year === debutYear && chronologicalYears.length > 1;
              const heightPercent = Math.max(16, Math.round((item.count / peakCount) * 100));

              return (
                <div
                  key={item.year}
                  onMouseEnter={() => setHoveredYearData(item)}
                  onMouseLeave={() => setHoveredYearData(null)}
                  onClick={() => onSelectYear(isSelected ? "all" : item.year)}
                  className="flex flex-col items-center flex-1 min-w-[42px] max-w-[72px] group/bar cursor-pointer select-none"
                >
                  {/* Top Badge: Peak or Count on hover */}
                  <div className="h-5 flex items-center justify-center mb-1.5 transition-transform duration-200 group-hover/bar:-translate-y-0.5">
                    {isPeak ? (
                      <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.2 rounded bg-accent text-zinc-950 shadow-[0_0_10px_rgba(245,179,1,0.6)]">
                        Peak
                      </span>
                    ) : isDebut ? (
                      <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 border border-purple-400/30">
                        Debut
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold text-zinc-400 opacity-0 group-hover/bar:opacity-100 transition-opacity">
                        {item.count}
                      </span>
                    )}
                  </div>

                  {/* Visual Bar */}
                  <div className="relative w-full h-24 sm:h-28 flex items-end justify-center">
                    {/* Background track */}
                    <div className="absolute inset-0 w-full rounded-t-lg bg-white/[0.03] group-hover/bar:bg-white/[0.06] transition-colors" />

                    {/* Colored Output Bar */}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`relative w-full rounded-t-lg transition-all duration-300 flex items-center justify-center ${
                        isSelected
                          ? "bg-gradient-to-t from-accent/70 via-accent to-accent shadow-[0_0_20px_rgba(245,179,1,0.5)] ring-2 ring-white"
                          : isPeak
                          ? "bg-gradient-to-t from-purple-600/70 via-accent to-accent/90 group-hover/bar:brightness-125"
                          : "bg-gradient-to-t from-white/20 via-white/35 to-white/50 group-hover/bar:from-accent/40 group-hover/bar:to-accent/80"
                      }`}
                    >
                      {/* Count label inside bar if tall enough */}
                      {heightPercent >= 35 && (
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            isSelected ? "text-zinc-950" : "text-white drop-shadow"
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Year Label Button */}
                  <div className="mt-2.5 flex flex-col items-center">
                    <span
                      className={`text-xs font-mono font-bold transition-all px-1.5 py-0.5 rounded-md ${
                        isSelected
                          ? "bg-accent text-zinc-950 font-black shadow-sm"
                          : "text-zinc-400 group-hover/bar:text-white"
                      }`}
                    >
                      {item.year}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Studio Production Breakdown Bar */}
      {studioDistribution.length > 0 && (
        <div className="relative z-10 p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/[0.07]">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-300">
              Studio Distribution & Loyalty
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              {studioDistribution.length} featured studios
            </span>
          </div>

          {/* Segmented Proportional Bar */}
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-white/5 p-0.5 border border-white/10 gap-0.5 mb-3.5">
            {studioDistribution.map((st) => (
              <div
                key={st.id}
                onClick={() => onSelectStudio(selectedStudio === st.id ? "all" : st.id)}
                title={`${st.name}: ${st.count} scenes (${Math.round(st.pct)}%)`}
                style={{
                  width: `${st.pct}%`,
                  backgroundColor: st.color,
                }}
                className={`h-full rounded-sm cursor-pointer transition-all duration-200 hover:brightness-125 ${
                  selectedStudio === st.id ? "ring-2 ring-white scale-y-125 z-10 shadow-lg" : ""
                }`}
              />
            ))}
          </div>

          {/* Studio Legend / Chips */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {studioDistribution.map((st) => {
              const isSelected = selectedStudio === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onSelectStudio(isSelected ? "all" : st.id)}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer active:scale-95 ${
                    isSelected
                      ? "bg-white/20 text-white font-bold ring-1 ring-accent"
                      : "bg-white/[0.03] text-zinc-300 hover:text-white hover:bg-white/[0.08] border border-white/5"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: st.color }}
                  />
                  <span className="truncate max-w-[140px]">{st.name}</span>
                  <span className="text-[10px] text-zinc-400 font-semibold">
                    {st.count} ({Math.round(st.pct)}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
