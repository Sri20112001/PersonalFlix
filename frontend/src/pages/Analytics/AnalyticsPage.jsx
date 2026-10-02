import React from "react";
import { Link } from "react-router-dom";
import { formatTime, formatTotalDuration } from "../../utilities/formatters";
import Spinner from "../../components/Spinner";
import { useAnalytics } from "../../hooks/useAnalytics";
import { ROUTES } from "../../constants/routes";

function Bars({ rows, valueKey = "count", suffix = "", labelKey }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey] || 0));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={r.name || r.week || r.day || r.title || i} className="flex items-center gap-3">
          <span className="w-36 flex-shrink-0 text-xs text-white truncate text-right">
            {labelKey ? r[labelKey] : r.name || r.week || r.day?.slice(5) || r.title}
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
        </div>
      ))}
      {rows.length === 0 && <div className="text-xs text-textMuted">Not enough data yet.</div>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, loading, cards, watchTime, watchTimeExact, hasExact, watchCards, daily, topScenes, ratingBuckets } =
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
