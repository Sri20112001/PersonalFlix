import React, { useState } from "react";
import { Link } from "react-router-dom";
import { formatTime, formatTotalDuration } from "../../utilities/formatters";
import { performerImage } from "../../utilities/media";
import Spinner from "../../components/Spinner";
import { useAnalytics } from "../../hooks/useAnalytics";
import { ROUTES } from "../../constants/routes";

function RowThumb({ src, name, shape = "circle" }) {
  const [failed, setFailed] = useState(false);
  const isCircle = shape === "circle";
  const cls = isCircle ? "w-7 h-7 rounded-full object-cover object-top" : "w-7 h-7 rounded-md object-cover";

  if (!src || failed) {
    return (
      <span
        className={`w-7 h-7 flex-shrink-0 flex items-center justify-center font-mono text-[11px] font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20 ${
          isCircle ? "rounded-full" : "rounded-md"
        }`}
      >
        {(name || "?")[0].toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${cls} flex-shrink-0 bg-black/60 border border-white/10`}
    />
  );
}

function MetricBars({ rows, valueKey = "count", suffix = "", labelKey, imageOf, imageShape, linkOf }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey] || 0));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const label = labelKey ? r[labelKey] : r.name || r.week || r.day?.slice(5) || r.title;
        const to = linkOf ? linkOf(r) : null;
        const val = r[valueKey] || 0;
        const pct = Math.min(100, Math.max(0, (val / max) * 100));

        const content = (
          <div className="group flex items-center gap-2.5 p-1 rounded-lg hover:bg-white/[0.03] transition-colors">
            {imageOf && <RowThumb src={imageOf(r)} name={label} shape={imageShape} />}
            <span className="w-28 sm:w-32 flex-shrink-0 text-xs text-zinc-300 truncate group-hover:text-amber-300 transition-colors">
              {label}
            </span>
            <div className="relative flex-1 h-1.5 rounded-full bg-zinc-900 border border-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 shadow-[0_0_8px_rgba(251,191,36,0.3)] transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-16 flex-shrink-0 text-[11px] font-mono text-zinc-400 text-right">
              {valueKey === "seconds" ? formatTime(val) : `${val}${suffix}`}
            </span>
          </div>
        );

        return to ? (
          <Link key={r.id || r.name || r.week || r.day || r.title || i} to={to} className="block">
            {content}
          </Link>
        ) : (
          <div key={r.name || r.week || r.day || r.title || i}>{content}</div>
        );
      })}
      {rows.length === 0 && <div className="text-xs text-zinc-600 py-1">No records available.</div>}
    </div>
  );
}

function HeatmapGrid({ days }) {
  if (!days || days.length === 0) {
    return <div className="text-xs text-zinc-600">No session log data yet.</div>;
  }
  const max = Math.max(1, ...days.map((d) => d.seconds || 0));

  const firstDow = (new Date(`${days[0].day}T12:00:00`).getDay() + 6) % 7;
  const cells = [
    ...Array(firstDow).fill(null),
    ...days.map((d) => ({ ...d, dow: (new Date(`${d.day}T12:00:00`).getDay() + 6) % 7 })),
  ];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const levelColor = (s) => {
    if (!s || s <= 0) return "bg-white/[0.03] border-white/[0.03]";
    const ratio = s / max;
    if (ratio < 0.25) return "bg-amber-500/20 border-amber-500/30";
    if (ratio < 0.5) return "bg-amber-500/45 border-amber-400/40 shadow-[0_0_6px_rgba(245,158,11,0.2)]";
    if (ratio < 0.75) return "bg-amber-400/75 border-amber-300/60 shadow-[0_0_8px_rgba(251,191,36,0.35)]";
    return "bg-amber-300 border-yellow-200 shadow-[0_0_12px_rgba(253,224,71,0.6)]";
  };

  const active = days.map((d) => (d.seconds || 0) > 0);
  let longest = 0, run = 0;
  for (const a of active) {
    run = a ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  const tail = [...active];
  if (!tail[tail.length - 1]) tail.pop();
  while (tail.length && tail[tail.length - 1]) {
    current++;
    tail.pop();
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1.5 flex-shrink-0">
            {Array.from({ length: 7 }).map((_, di) => {
              const c = w[di];
              if (!c) return <span key={di} className="w-3 h-3" />;
              return (
                <span
                  key={di}
                  title={`${c.day} · ${formatTime(c.seconds || 0)}`}
                  className={`w-3 h-3 rounded-[3px] border transition-transform hover:scale-125 cursor-pointer ${levelColor(
                    c.seconds
                  )}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5 text-[10px] text-zinc-500 font-mono">
        <div className="flex items-center gap-1.5">
          <span>Cold</span>
          <span className="w-2 h-2 rounded-[2px] bg-white/[0.04]" />
          <span className="w-2 h-2 rounded-[2px] bg-amber-500/25" />
          <span className="w-2 h-2 rounded-[2px] bg-amber-500/50" />
          <span className="w-2 h-2 rounded-[2px] bg-amber-400" />
          <span>Hot</span>
        </div>

        <div className="flex items-center gap-3">
          <span>Streak: <b className="text-amber-300 font-bold">{current}d</b></span>
          <span>Best: <b className="text-zinc-200 font-bold">{longest}d</b></span>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const {
    data,
    loading,
    cards,
    watchTime,
    watchTimeExact,
    hasExact,
    watchCards,
    daily,
    heatmap,
    completion,
    topScenes,
    ratingBuckets,
  } = useAnalytics();

  const [categoryMode, setCategoryMode] = useState("count"); // "count" | "seconds"

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#090a0d]">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-sm font-mono text-zinc-600 bg-[#090a0d]">
        NO ANALYTICS INITIALIZED
      </div>
    );
  }

  return (
    <div className="h-full bg-[#090a0d] text-zinc-100 p-6 md:p-8 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto pb-14 space-y-6">

        {/* 1. Integrated Header & Quick Telemetry HUD */}
        <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5 md:p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-amber-400/90 uppercase mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Library Intelligence
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-display">
                Analytics Control Center
              </h1>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-zinc-400 bg-black/40 px-3.5 py-2 rounded-xl border border-white/5 self-start md:self-auto">
              <span>{data.scenesTotal} Scenes</span>
              <span className="text-zinc-600">|</span>
              <span className="text-emerald-400">{data.rated} Rated</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">{data.skipped} Skipped</span>
            </div>
          </div>

          {/* Quick Stats Rail */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-5">
            {cards.map(([label, value]) => (
              <div key={label} className="border-l border-white/10 pl-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</div>
                <div className="text-xl font-mono font-bold text-white mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Main 2-Column Dashboard Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Timeline, Activity & Playback (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Watch-Time Telemetry Bar */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-mono uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Watch Time Intervals
                </h2>
                <span className="text-[11px] font-mono text-zinc-500">
                  Total Runtime: {formatTotalDuration(watchTime.totalDuration || 0)}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {watchCards.map(([label, value]) => (
                  <div key={label} className="bg-black/30 rounded-xl p-2.5 border border-white/5 text-center">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">{label}</div>
                    <div className="text-sm font-mono font-bold text-amber-300 mt-0.5 truncate">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap & Playback Completion Grid */}
            <div className="grid sm:grid-cols-2 gap-6">
              {/* Activity Heatmap */}
              <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 mb-3">
                  Activity · 120 Days
                </h3>
                <HeatmapGrid days={heatmap} />
              </div>

              {/* Completion Buckets */}
              <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
                    Completion Breakdown
                  </h3>
                  {completion && completion.measured > 0 && (
                    <span className="text-[10px] font-mono text-amber-300">
                      {completion.avgPct}% avg
                    </span>
                  )}
                </div>
                <MetricBars rows={(completion && completion.buckets) || []} labelKey="label" />
              </div>
            </div>

            {/* Daily Trend Chart (30 Days) */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 mb-3">
                Daily Playback · Last 30 Days
              </h3>
              <div className="max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                <MetricBars rows={daily} valueKey="seconds" />
              </div>
            </div>

            {/* Top Scenes Leaderboard */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 mb-3">
                Top Scenes by Watch Time
              </h3>
              <div className="flex flex-col gap-2">
                {topScenes.slice(0, 5).map((s) => (
                  <Link
                    key={s.scene_id}
                    to={ROUTES.scene(s.scene_id)}
                    className="flex items-center gap-3 p-2 rounded-xl bg-black/20 hover:bg-white/[0.04] border border-white/5 transition-colors group"
                  >
                    <span className="flex-1 min-w-0 text-xs text-zinc-300 truncate group-hover:text-amber-300 transition-colors">
                      {s.title || `Scene #${s.scene_id}`}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {formatTime(s.seconds || 0)}
                    </span>
                    {s.duration > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-500">
                        {Math.min(100, Math.round(((s.seconds || 0) / s.duration) * 100))}%
                      </span>
                    )}
                  </Link>
                ))}
              </div>

              {ratingBuckets.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase mr-2">Ratings:</span>
                  {ratingBuckets.map((b) => (
                    <span
                      key={b.rating}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/40 border border-white/5 text-zinc-300"
                    >
                      ★{b.rating} <span className="text-amber-400/80">({b.count})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Categorical Intelligence Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-6">

            {/* Toggle Hub: Mode Switcher */}
            <div className="flex items-center justify-between p-1 bg-black/40 border border-white/5 rounded-xl">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 pl-3">Sort Metrics:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCategoryMode("count")}
                  className={`text-[10px] font-mono px-3 py-1 rounded-lg transition-colors ${
                    categoryMode === "count" ? "bg-amber-400 text-black font-bold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  By Counts
                </button>
                <button
                  onClick={() => setCategoryMode("seconds")}
                  className={`text-[10px] font-mono px-3 py-1 rounded-lg transition-colors ${
                    categoryMode === "seconds" ? "bg-amber-400 text-black font-bold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  By Time
                </button>
              </div>
            </div>

            {/* Top Performers */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 mb-3">
                Top Performers
              </h3>
              <MetricBars
                rows={data.topPerformers || []}
                valueKey={categoryMode}
                imageOf={(r) => (r.id ? performerImage(r.id) : null)}
                imageShape="circle"
              />
            </div>

            {/* Top Studios */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 mb-3">
                Top Studios
              </h3>
              <MetricBars rows={data.topStudios || []} valueKey={categoryMode} />
            </div>

            {/* Categories */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 mb-3">
                Categories
              </h3>
              <MetricBars rows={data.topCategories || []} valueKey={categoryMode} />
            </div>

            {/* Weekly Volume */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/10 backdrop-blur-xl p-5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 mb-3">
                Weekly Volume
              </h3>
              <MetricBars rows={data.weekly || []} suffix=" scenes" />
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}