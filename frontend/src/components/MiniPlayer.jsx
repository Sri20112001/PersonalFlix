import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/apiClient";
import { videoUrl } from "../utilities/media";
import { formatTime } from "../utilities/formatters";

export default function MiniPlayer({ sceneId, initialTime = 0, onClose, onExpand }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(initialTime);
  const [duration, setDuration] = useState(0);
  const [scene, setScene] = useState(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!sceneId) return;
    api.scene(sceneId).then((res) => setScene(res.scene)).catch(() => {});
  }, [sceneId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = initialTime || 0;
    v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [sceneId, initialTime]);

  const togglePlay = (e) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = (e) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v) setCurrent(v.currentTime);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v) setDuration(v.duration || 0);
  };

  const handleExpand = (e) => {
    e?.stopPropagation();
    const cur = videoRef.current ? videoRef.current.currentTime : current;
    onExpand && onExpand(cur);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 aspect-video rounded-2xl overflow-hidden bg-black border border-white/20 shadow-2xl shadow-black/90 group transition-all duration-300 hover:scale-[1.02] ring-1 ring-white/10 select-none animate-fade-in"
    >
      <video
        ref={videoRef}
        src={videoUrl(sceneId)}
        className="w-full h-full object-cover cursor-pointer"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onClick={handleExpand}
        autoPlay
        playsInline
      />

      {/* Progress Bar along bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60 overflow-hidden pointer-events-none">
        <div
          className="h-full bg-accent transition-all duration-100 shadow-[0_0_8px_var(--color-accent)]"
          style={{ width: `${duration > 0 ? (current / duration) * 100 : 0}%` }}
        />
      </div>

      {/* Hover Floating Controls Overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/75 p-3 flex flex-col justify-between transition-opacity duration-200 ${
          hovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-white truncate drop-shadow-md">
            {scene?.title || scene?.file_name || "Playing Scene"}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleExpand}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-accent text-zinc-300 hover:text-zinc-950 transition-colors cursor-pointer"
              title="Expand to Full Player"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose && onClose();
              }}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-rose-500/80 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Close Mini-Player"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-full bg-accent text-zinc-950 hover:brightness-110 transition-transform active:scale-90 cursor-pointer shadow-md"
              title={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.9-2.9-1.4-1.4-2.9 2.9-2.9-2.9-1.4 1.4 2.9 2.9-2.9 2.9 1.4 1.4 2.9-2.9 2.9 2.9 1.4-1.4-2.9-2.9z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zm-2.5 7.2v2.1A7 7 0 0 0 20.5 12 7 7 0 0 0 14 5.7v2.1a5 5 0 0 1 0 8.4z" />
                </svg>
              )}
            </button>

            <span className="text-[10px] font-mono font-bold text-zinc-300">
              {formatTime(current)} <span className="text-zinc-500">/</span> {formatTime(duration)}
            </span>
          </div>

          <button
            onClick={handleExpand}
            className="text-[10px] font-bold uppercase tracking-wider text-accent hover:underline cursor-pointer"
          >
            Resume Full
          </button>
        </div>
      </div>
    </div>
  );
}
