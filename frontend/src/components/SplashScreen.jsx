import React, { useEffect, useState } from "react";
export default function SplashScreen({
  onFinish,
  duration = 2400, // Duration in ms before transitioning to the app
  statusText = "Loading library...",
}) {
  const [progress, setProgress] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setFadingOut(true);
        setTimeout(() => {
          if (onFinish) onFinish();
        }, 500); // Wait for fade-out transition
      }
    }, 25);

    return () => clearInterval(interval);
  }, [duration, onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#070708] select-none transition-opacity duration-500 ease-out ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background Radial Glow */}
      <div className="absolute w-[400px] h-[400px] rounded-full bg-accent/15 blur-[120px] pointer-events-none animate-pulse" />

      {/* Brand Icon & Typography */}
      <div className="relative flex flex-col items-center gap-6 z-10">
        {/* Animated Brand Emblem */}
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-950 border border-white/10 shadow-2xl shadow-accent/30 overflow-hidden group">
          {/* Internal diagonal shine sweep */}
          <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]" />

          {/* Center Play Icon */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-accent ml-1 drop-shadow-[0_0_12px_var(--color-accent)] animate-[pulse_2s_ease-in-out_infinite]"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>

        {/* Title */}
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="font-display text-2xl tracking-[0.3em] uppercase font-black text-white drop-shadow-md">
            Personal<span className="text-accent">Flix</span>
          </h1>
          <span className="text-[10px] tracking-[0.35em] uppercase text-zinc-500 font-mono">
            {statusText}
          </span>
        </div>

        {/* Progress Track */}
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden mt-3 relative">
          <div
            className="h-full bg-accent transition-all duration-75 ease-out shadow-[0_0_10px_var(--color-accent)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Bottom Version / Metadata */}
      <div className="absolute bottom-6 flex items-center gap-2 text-[10px] font-mono text-zinc-600">
        <span>v1.0.0</span>
        <span>•</span>
        <span>DESKTOP RUNTIME</span>
      </div>
    </div>
  );
}
