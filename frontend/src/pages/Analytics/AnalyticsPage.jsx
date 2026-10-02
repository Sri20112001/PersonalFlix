import React, { useState } from "react";
import { Link } from "react-router-dom";
import { formatTime, formatTotalDuration } from "../../utilities/formatters";
import { performerImage } from "../../utilities/media";
import Spinner from "../../components/Spinner";
import { useAnalytics } from "../../hooks/useAnalytics";
import { ROUTES } from "../../constants/routes";

function RowThumb({ src, name, shape = "circle" }) {
  const [failed, setFailed] = useState(false);
  const cls =
    shape === "circle" ? "w-7 h-7 rounded-full object-cover object-top" : "w-7 h-7 rounded-md object-cover";
  if (!src || failed) {
    return (
      <span
        className={`w-7 h-7 flex-shrink-0 flex items-center justify-center font-display text-sm text-accent bg-accent/10 border border-accent/20 ${
          shape === "circle" ? "rounded-full" : "rounded-md"
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
      className={`${cls} flex-shrink-0 bg-black/40 border border-white/10`}
    />
  );
}

function Bars({ rows, valueKey = "count", suffix = "", labelKey, imageOf, imageShape, linkOf }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey] || 0));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const label = labelKey ? r[labelKey] : r.name || r.week || r.day?.slice(5) || r.title;
        const to = linkOf ? linkOf(r) : null;
        const row = (
          <>
            {imageOf && <RowThumb src={imageOf(r)} name={label} shape={imageShape} />}
            <span className="w-36 flex-shrink-0 text-xs text-white truncate text-right group-hover:text-accent transition-colors">
              {label}
            </span>
            <div className="flex-1 h-2.5 bg-black/50 rounded overflow-hidden">
              <div
                className="h-full bg-accent rounded"
                style={{ width: `${((r[valueKey] || 0) / max) * 100}%` }}
              />
            </div>
            <span className="w-16 flex-shrink-0 text-[11px] font-mono text-textSecondary">
              {valueKey === "seconds" ? formatTime(r[valueKey] || 0) : `${r[valueKey] || 0}${suffix}`}
            </span>
          </>
        );
        return to ? (
          <Link key={r.id || r.name || r.week || r.day || r.title || i} to={to} className="flex items-center gap-3 group">
            {row}
          </Link>
        ) : (
          <div key={r.name || r.week || r.day || r.title || i} className="flex items-center gap-3">
            {row}
          </div>
        );
      })}
      {rows.length === 0 && <div className="text-xs text-textMuted">Not enough data yet.</div>}
    </div>
  );
}

function Heatmap({ days }) {
  if (!days || days.length === 0) {
    return <div className="text-xs text-textMuted">Not enough data yet.</div>;
  }
  const max = Math.max(1, ...days.map((d) => d.seconds || 0));
  // Columns = weeks (Monday-first); pad the first column to align weekdays.
  const firstDow = (new Date(`${days[0].day}T12:00:00`).getDay() + 6) % 7;
  const cells = [
    ...Array(firstDow).fill(null),
    ...days.map((d) => ({ ...d, dow: (new Date(`${d.day}T12:00:00`).getDay() + 6) % 7 })),
  ];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const level = (s) => {
    if (!s || s <= 0) return "bg-white/5";
    const r = s / max;
    if (r < 0.25) return "bg-accent/25";
    if (r < 0.5) return "bg-accent/50";
    if (r < 0.75) return "bg-accent/75";
    return "bg-accent";
  };
  // Streaks over active days (any watch time).
  const active = days.map((d) => (d.seconds || 0) > 0);
  let longest = 0, run = 0;
  for (const a of active) {
    run = a ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  const tail = [...active];
  if (!tail[tail.length - 1]) tail.pop(); // today not over yet — don't break the streak
  while (tail.length && tail[tail.length - 1]) {
    current++;
    tail.pop();
  }
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1 flex-shrink-0">
            {Array.from({ length: 7 }).map((_, di) => {
              const c = w[di];
              if (!c) return <span key={di} className="w-3 h-3" />;
              return (
                <span
                  key={di}
                  title={`${c.day} · ${formatTime(c.seconds || 0)}`}
                  className={`w-3 h-3 rounded-[3px] ${level(c.seconds)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5 text-[10px] text-textMuted">
          <span>Less</span>
          {["bg-white/5", "bg-accent/25", "bg-accent/50", "bg-accent/75", "bg-accent"].map((c) => (
            <span key={c} className={`w-3 h-3 rounded-[3px] ${c}`} />
          ))}
          <span>More</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-textSecondary">
          <span>
            <b className="text-accent">{current}d</b> streak
          </span>
          <span>
            <b className="text-white">{longest}d</b> best
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, loading, cards, watchTime, watchTimeExact, hasExact, watchCards, daily, heatmap, completion, topScenes, ratingBuckets } =
    useAnalytics();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-textMuted">
        No data.
      </div>
    );
  }

  return (
    <div className="h-full bg-background pt-6 px-10 overflow-y-auto">
      <div className="pb-12">
        <h1 className="font-display uppercase tracking-widest text-2xl mb-1">Your Library</h1>
        <p className="text-xs text-textMuted mb-6">
          {data.scenesTotal} scenes Â· {data.rated} rated Â· {data.skipped} skipped
        </p>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-8">
          {cards.map(([label, value]) => (
            <div key={label} className="bg-surface rounded-lg px-4 py-3">
              <div className="text-xl font-display tracking-wide text-white truncate">{value}</div>
              <div className="text-[10px] uppercase tracking-widest text-textSecondary mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Watch-time details */}
        <h2 className="font-display uppercase tracking-widest text-lg mb-1">Watch time</h2>
        <p className="text-xs text-textMuted mb-4">
          {hasExact ? (
            <>
              Exact session log · {watchTimeExact.sessions || 0} sessions ·{" "}
              {watchTimeExact.events || 0} events · catalog runtime{" "}
              {formatTotalDuration(watchTime.totalDuration || 0)}
            </>
          ) : (
            <>
              {watchTime.sessionsToday || 0} sessions today · {watchTime.sessions7d || 0} last 7d ·{" "}
              {watchTime.sessions30d || 0} last 30d · catalog runtime{" "}
              {formatTotalDuration(watchTime.totalDuration || 0)} · exact log starts on next play
            </>
          )}
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {watchCards.map(([label, value]) => (
            <div key={label} className="bg-surface rounded-lg px-4 py-3 border border-accent/20">
              <div className="text-xl font-display tracking-wide text-accent truncate">{value}</div>
              <div className="text-[10px] uppercase tracking-widest text-textSecondary mt-1">{label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-1">
              Activity · last 120 days
            </h2>
            <p className="text-[11px] text-textMuted mb-4">Darker gold = more watch time.</p>
            <Heatmap days={heatmap} />
          </div>
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-1">
              Completion
            </h2>
            <p className="text-[11px] text-textMuted mb-4">
              {completion && completion.measured > 0 ? (
                <>
                  Avg <b className="text-accent">{completion.avgPct}%</b> watched across{" "}
                  {completion.measured} measured scenes ·{" "}
                  <b className="text-white">{completion.finished}</b> finished
                </>
              ) : (
                "Play a scene to the end to measure completion."
              )}
            </p>
            <Bars rows={(completion && completion.buckets) || []} labelKey="label" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-4">
              Daily watch time · last 30 days
            </h2>
            <div className="max-h-64 overflow-y-auto pr-1">
              <Bars rows={daily} valueKey="seconds" />
            </div>
          </div>
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-4">
              Top scenes by watch time
            </h2>
            {topScenes.length === 0 ? (
              <div className="text-xs text-textMuted">Not enough data yet.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {topScenes.map((s) => (
                  <Link
                    key={s.scene_id}
                    to={ROUTES.scene(s.scene_id)}
                    className="flex items-center gap-3 group"
                  >
                    <span className="flex-1 min-w-0 text-xs text-white truncate group-hover:text-accent">
                      {s.title || `Scene ${s.scene_id}`}
                    </span>
                    <span className="w-16 flex-shrink-0 text-right text-[11px] font-mono text-textSecondary">
                      {formatTime(s.seconds || 0)}
                    </span>
                    {s.duration > 0 && (
                      <span className="w-14 flex-shrink-0 text-right text-[10px] font-mono text-textMuted">
                        {Math.min(100, Math.round(((s.seconds || 0) / s.duration) * 100))}%
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
            {ratingBuckets.length > 0 && (
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-textMuted mb-2">
                  Ratings
                </div>
                <div className="flex gap-2 flex-wrap">
                  {ratingBuckets.map((b) => (
                    <span
                      key={b.rating}
                      className="text-[11px] font-mono px-2 py-1 rounded bg-black/40 text-textSecondary"
                    >
                      ★{b.rating} · {b.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-4">Top studios</h2>
            <Bars rows={data.topStudios || []} />
            {(data.topStudios || []).some((r) => r.seconds > 0) && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-textMuted mb-2">By watch time</div>
                <Bars rows={data.topStudios || []} valueKey="seconds" />
              </div>
            )}
          </div>
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-4">Top performers</h2>
            <Bars rows={data.topPerformers || []} />
            {(data.topPerformers || []).some((r) => r.seconds > 0) && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-textMuted mb-2">By watch time</div>
                <Bars rows={data.topPerformers || []} valueKey="seconds" />
              </div>
            )}
          </div>
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-4">Favorite categories</h2>
            <Bars rows={data.topCategories || []} />
            {(data.topCategories || []).some((r) => r.seconds > 0) && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-textMuted mb-2">By watch time</div>
                <Bars rows={data.topCategories || []} valueKey="seconds" />
              </div>
            )}
          </div>
          <div className="bg-surface rounded-lg p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-textSecondary mb-4">Weekly activity</h2>
            <Bars rows={data.weekly || []} suffix=" scenes" />
          </div>
        </div>
      </div>
    </div>
  );
}
