import { useState, useEffect } from "react";

function VinylDisc({ size = 128 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className="duration-500 border-4 rounded-full shadow-md border-white/20 animate-[spin_6s_linear_infinite] transition-all"
    >
      <g>
        <rect width="128" height="128" fill="black" />
        <circle cx="20" cy="20" r="2" fill="white" />
        <circle cx="40" cy="30" r="2" fill="white" />
        <circle cx="60" cy="10" r="2" fill="white" />
        <circle cx="80" cy="40" r="2" fill="white" />
        <circle cx="100" cy="20" r="2" fill="white" />
        <circle cx="120" cy="50" r="2" fill="white" />
        <circle cx="90" cy="30" r="10" fill="white" fillOpacity="0.5" />
        <circle cx="90" cy="30" r="8" fill="white" />
        <path d="M0 128 Q32 64 64 128 T128 128" fill="#F5B301" stroke="black" strokeWidth="1" />
        <path d="M0 128 Q32 48 64 128 T128 128" fill="#E50914" stroke="black" strokeWidth="1" />
        <path d="M0 128 Q32 32 64 128 T128 128" fill="#B26A00" stroke="black" strokeWidth="1" />
        <path d="M0 128 Q16 64 32 128 T64 128" fill="#F5B301" stroke="black" strokeWidth="1" />
        <path d="M64 128 Q80 64 96 128 T128 128" fill="#E50914" stroke="black" strokeWidth="1" />
      </g>
    </svg>
  );
}

export default function VinylPlayerCard({
  title = "Unknown title",
  subtitle = "",
  artwork = null,
  progress = 0, // 0-100
  currentLabel = "0:00",
  durationLabel = "",
  onPrev,
  onNext,
  onPlay,
  onShuffle,
  onQueue,
}) {
  const [shuffleMode, setShuffleMode] = useState(false);
  const [artworkError, setArtworkError] = useState(false);
  const pct = Math.max(0, Math.min(100, progress || 0));

  useEffect(() => {
    setArtworkError(false);
  }, [artwork]);

  const showArtwork = Boolean(artwork && !artworkError);

  return (
    <div className="flex flex-col items-center select-none group/vinyl">
      {/* top disc peeks out, retracts on hover — video thumbnail when available */}
      <div className="relative z-0 h-16 -mb-2 transition-all duration-200 group-hover/vinyl:h-0 group-hover/vinyl:opacity-0 overflow-hidden">
        {showArtwork ? (
          <img
            src={artwork}
            alt=""
            onError={() => setArtworkError(true)}
            className="rounded-full object-cover border-4 border-white/20 shadow-md animate-[spin_6s_linear_infinite]"
            style={{ width: 128, height: 128 }}
          />
        ) : (
          <VinylDisc size={128} />
        )}
        <div className="absolute z-10 w-8 h-8 bg-white border-4 rounded-full shadow-sm border-white/20 top-12 left-12" />
      </div>

      <div className="z-30 flex flex-col w-40 h-20 transition-all duration-300 bg-surface border border-white/10 shadow-2xl group-hover/vinyl:h-44 group-hover/vinyl:w-72 rounded-2xl overflow-hidden">
        <div className="flex flex-row w-full h-0 group-hover/vinyl:h-20">
          <div className="relative flex items-center justify-center w-24 h-24 group-hover/vinyl:-top-6 group-hover/vinyl:-left-4 opacity-0 group-hover/vinyl:opacity-100 transition-all duration-100">
            {showArtwork ? (
              <img
                src={artwork}
                alt=""
                onError={() => setArtworkError(true)}
                className="duration-500 border-4 rounded-full shadow-md border-white/20 object-cover animate-[spin_6s_linear_infinite]"
                style={{ width: 96, height: 96 }}
              />
            ) : (
              <VinylDisc size={96} />
            )}
            <div className="absolute z-10 w-6 h-6 bg-white border-4 rounded-full shadow-sm border-white/20 top-9 left-9" />
          </div>
          <div className="flex flex-col justify-center w-full pl-3 -ml-24 overflow-hidden group-hover/vinyl:-ml-3 text-nowrap">
            <p className="text-base font-bold text-white truncate max-w-[150px]">{title}</p>
            {subtitle && <p className="text-xs text-textSecondary truncate max-w-[150px]">{subtitle}</p>}
          </div>
        </div>

        {/* progress */}
        <div className="flex flex-row items-center mx-3 mt-3 bg-white/5 rounded-md min-h-4 group-hover/vinyl:mt-0">
          <span className="hidden pl-3 text-xs text-textSecondary group-hover/vinyl:inline-block font-mono">
            {currentLabel}
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={pct}
            readOnly
            aria-label="Watch progress"
            className="w-24 group-hover/vinyl:w-full flex-grow h-1 mx-2 my-auto bg-white/10 rounded-full appearance-none accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-default [&::-webkit-slider-thumb]:shadow-md"
          />
          <span className="hidden pr-3 text-xs text-textSecondary group-hover/vinyl:inline-block font-mono">
            {durationLabel}
          </span>
        </div>

        {/* transport */}
        <div className="flex flex-row items-center justify-center flex-grow mx-3 space-x-5 text-white">
          <button
            onClick={() => {
              setShuffleMode((v) => !v);
              if (shuffleMode && onShuffle) onShuffle();
            }}
            className="flex items-center justify-center w-0 h-full cursor-pointer group-hover/vinyl:w-12 overflow-hidden transition-all"
            title={shuffleMode ? "Shuffle on — play random" : "Repeat"}
          >
            {!shuffleMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5B301" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            )}
          </button>
          <button onClick={onPrev} className="flex items-center justify-center w-12 h-full cursor-pointer text-white/80 hover:text-accent transition-colors" title="Previous">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </button>
          <button onClick={onPlay} className="flex items-center justify-center w-12 h-full cursor-pointer text-white hover:text-accent transition-colors" title="Play">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
          <button onClick={onNext} className="flex items-center justify-center w-12 h-full cursor-pointer text-white/80 hover:text-accent transition-colors" title="Next">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>
          <button onClick={onQueue} className="flex items-center justify-center w-12 h-full cursor-pointer text-white/80 hover:text-accent transition-colors" title="Open library">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-0 group-hover/vinyl:w-12 transition-all overflow-hidden">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
