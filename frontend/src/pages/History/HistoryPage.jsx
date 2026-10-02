import React from "react";
import { Link } from "react-router-dom";
import { formatTime } from "../../utilities/formatters";
import { thumbUrl } from "../../utilities/media";
import Spinner from "../../components/Spinner";
import { ChevronLeftIcon, ChevronRightIcon } from "../../utilities/icons";
import { useWatchHistory } from "../../hooks/useWatchHistory";
import { WEEKDAYS, dayKey } from "../../utilities/historyUtils";
import { ROUTES } from "../../constants/routes";

export default function HistoryPage() {
  const {
    days,
    loading,
    byDay,
    monthTotal,
    monthSeconds,
    cells,
    selected,
    setSelected,
    sel,
    monthName,
    shiftMonth,
    resetToCurrentMonth,
  } = useWatchHistory();

  return (
    <div className="h-full flex flex-col bg-background pt-6 px-10 overflow-hidden">
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="font-display uppercase tracking-widest text-2xl">Watch History</h1>
          <p className="text-xs text-textMuted mt-1">
            {monthTotal} scene{monthTotal === 1 ? "" : "s"} · {formatTime(monthSeconds || 0)} watched this month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="w-9 h-9 rounded bg-surface hover:bg-surfaceHover text-white transition-colors flex items-center justify-center cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <button
            onClick={resetToCurrentMonth}
            className="px-4 h-9 rounded bg-surface hover:bg-surfaceHover text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
          >
            {monthName}
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="w-9 h-9 rounded bg-surface hover:bg-surfaceHover text-white transition-colors flex items-center justify-center cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex-1 flex gap-6 min-h-0 pb-8">
          {/* Calendar */}
          <div className="flex-[1.2] min-w-0">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[10px] font-bold uppercase tracking-widest text-textMuted py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((c) => {
                if (!c.date) return <div key={c.key} />;
                const key = dayKey(c.date.getFullYear(), c.date.getMonth(), c.date.getDate());
                const info = byDay[key];
                const count = info?.count || 0;
                const isSel = selected === key && !c.other;
                return (
                  <button
                    key={c.key}
                    disabled={c.other}
                    onClick={() => setSelected(key)}
                    className={`aspect-square rounded flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      c.other ? "opacity-0" : "hover:scale-[1.04]"
                    } ${isSel ? "ring-2 ring-accent" : ""}`}
                    style={{
                      background: count > 0 ? `rgba(245,179,1,${Math.min(0.12 + count * 0.12, 0.55)})` : "#141415",
                    }}
                    title={count > 0 ? `${count} scene${count === 1 ? "" : "s"}` : ""}
                  >
                    <span className={`text-sm font-semibold ${count > 0 ? "text-white" : "text-textSecondary"}`}>{c.label}</span>
                    {count > 0 && (
                      <span className="text-[10px] font-mono text-accent">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day detail */}
          <div className="flex-1 min-w-0 bg-surface rounded-lg overflow-hidden flex flex-col">
            {!sel ? (
              <div className="flex-1 flex items-center justify-center text-sm text-textMuted p-8 text-center">
                {days.length === 0 ? "No watch history yet." : "Select a highlighted day."}
              </div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-white/10 flex-shrink-0">
                  <div className="font-display uppercase tracking-widest">
                    {new Date(sel.day + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                  </div>
                  <div className="text-xs text-textSecondary mt-0.5">
                    {sel.count} scene{sel.count === 1 ? "" : "s"} Ã‚Â· {formatTime(sel.seconds || 0)} watched
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {(sel.entries || []).map((e) => (
                    <Link
                      key={e.scene_id}
                      to={ROUTES.scene(e.scene_id)}
                      replace={true}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="w-20 h-11 rounded bg-cover bg-center flex-shrink-0"
                        style={{ backgroundImage: `url(${thumbUrl(e.scene_id)})`, backgroundColor: "#1F1F21" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{e.scene?.title || e.scene?.file_name || `Scene ${e.scene_id}`}</div>
                        <div className="text-xs text-textSecondary truncate">
                          {e.status}{e.currentTime > 0 ? ` Ã‚Â· ${formatTime(e.currentTime)}` : ""}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
