import React from "react";
import { thumbUrl } from "../../utilities/media";
import { formatTime, formatYear } from "../../utilities/formatters";
import { useLeanback } from "../../hooks/useLeanback";
import { ROUTES } from "../../constants/routes";

export default function LeanbackPage() {
  const {
    rows,
    rowIdx,
    colIdx,
    setRowIdx,
    setColIdx,
    timeStr,
    loading,
    activeScene,
    navigate,
  } = useLeanback();

  return (
    <div className="h-full w-full bg-[#070708] text-white flex flex-col overflow-hidden select-none p-8 sm:p-12 font-sans relative">
      {/* Top TV Bar */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-accent animate-pulse" />
            <span className="font-display tracking-widest text-2xl font-black uppercase text-white">
              PersonalFlix <span className="text-accent">Couch</span>
            </span>
          </div>
          <span className="text-xs bg-white/10 text-zinc-300 px-3 py-1 rounded-full font-mono font-bold uppercase tracking-wider border border-white/10">
            TV / Leanback Mode
          </span>
        </div>

        <div className="flex items-center gap-6">
          <span className="font-mono text-xl text-zinc-300 font-bold tracking-wider">
            {timeStr}
          </span>
          <button
            onClick={() => navigate(ROUTES.HOME)}
            className="flex items-center gap-2 bg-zinc-900/80 hover:bg-white/10 border border-white/20 text-zinc-300 hover:text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            <span>Exit (Esc)</span>
          </button>
        </div>
      </div>

      {/* Featured Header Showcase for Currently Focused Item */}
      {activeScene && (
        <div className="mb-6 flex-shrink-0 flex flex-col justify-end min-h-[140px] max-w-4xl animate-fade-in z-10">
          <div className="flex items-center gap-3 text-xs font-mono text-accent font-bold uppercase tracking-wider mb-2">
            {activeScene.resolution && (
              <span className="bg-accent/20 text-accent px-2 py-0.5 rounded border border-accent/40">
                {activeScene.resolution}
              </span>
            )}
            {activeScene.studio && (
              <span className="text-zinc-300 font-sans font-bold">
                {activeScene.studio}
              </span>
            )}
            {activeScene.date && <span>{formatYear(activeScene.date)}</span>}
            {activeScene.duration > 0 && <span>{formatTime(activeScene.duration)}</span>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide truncate mb-1">
            {activeScene.title || activeScene.file_name}
          </h1>
          {activeScene.performers && activeScene.performers.length > 0 && (
            <div className="text-sm text-zinc-400 font-medium truncate">
              Starring {activeScene.performers.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Rows Container */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-8 pb-10 pr-2">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 font-mono text-sm">
            Loading Couch Experience...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-zinc-500 font-mono text-center py-20">
            No media found for leanback mode.
          </div>
        ) : (
          rows.map((row, rI) => {
            const isRowFocused = rowIdx === rI;
            return (
              <div key={row.title} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2
                    className={`text-sm font-bold uppercase tracking-widest transition-colors ${
                      isRowFocused ? "text-accent font-black" : "text-zinc-400"
                    }`}
                  >
                    {row.title}
                  </h2>
                  <span className="text-xs font-mono text-zinc-600">
                    {row.items.length} items
                  </span>
                </div>

                {/* Horizontal Scrolling Rail */}
                <div className="flex items-center gap-4 overflow-x-auto py-3 px-1 no-scrollbar scroll-smooth">
                  {row.items.map((item, cI) => {
                    const isCardFocused = isRowFocused && colIdx === cI;
                    return (
                      <div
                        key={item._id}
                        onClick={() => navigate(ROUTES.scene(item._id, { resume: true }), { replace: true })}
                        onMouseEnter={() => {
                          setRowIdx(rI);
                          setColIdx(cI);
                        }}
                        className={`relative flex-shrink-0 w-64 sm:w-72 aspect-video rounded-2xl overflow-hidden bg-zinc-900 border transition-all duration-300 cursor-pointer ${
                          isCardFocused
                            ? "scale-105 ring-4 ring-accent shadow-2xl shadow-accent/30 z-20 border-accent"
                            : "border-white/10 opacity-70 hover:opacity-90 scale-95"
                        }`}
                      >
                        <img
                          src={thumbUrl(item._id)}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 flex flex-col justify-end">
                          <div className="text-xs font-bold text-white truncate drop-shadow">
                            {item.title || item.file_name}
                          </div>
                        </div>

                        {/* Focus Play Pill */}
                        {isCardFocused && (
                          <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-accent text-zinc-950 font-mono text-[9px] font-black uppercase flex items-center gap-1 shadow-lg animate-fade-in">
                            <span>Press Enter</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Remote Control Guide */}
      <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-zinc-500 z-20">
        <div className="flex items-center gap-4">
          <span><kbd className="bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">â–²/â–¼</kbd> Switch Rails</span>
          <span><kbd className="bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">â—€/â–¶</kbd> Browse Videos</span>
          <span><kbd className="bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">Enter</kbd> Play Video</span>
        </div>
        <div>
          <span><kbd className="bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">Esc</kbd> Exit Leanback</span>
        </div>
      </div>
    </div>
  );
}
