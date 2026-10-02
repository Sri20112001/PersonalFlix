import React from "react";

export default function PlayPauseButton({
  playing = false,
  onToggle,
  size = 64,
  color = "#E50914",
  title,
}) {
  const icon = Math.round(size * 0.33);

  return (
    <div
      className="relative rounded-full shrink-0"
      style={{ width: size, height: size, ["--ppb"]: color }}
      title={title ?? (playing ? "Pause" : "Play")}
    >
      <style>{`
        @keyframes ppb-border {
          0% { transform: rotate(0); background: conic-gradient(var(--ppb), transparent 20%); }
          80% { background: conic-gradient(var(--ppb), transparent 90%); }
          100% { transform: rotate(360deg); background: conic-gradient(var(--ppb), var(--ppb)); }
        }
        @keyframes ppb-reveal {
          0% { width: 0; }
          100% { width: 35%; }
        }
      `}</style>

      {/* conic ring toggle */}
      <input
        type="checkbox"
        checked={playing}
        onChange={(e) => onToggle && onToggle(e.target.checked, e)}
        aria-label={playing ? "Pause" : "Play"}
        aria-pressed={playing}
        className="absolute inset-0 w-full h-full rounded-full cursor-pointer outline-none appearance-none"
        style={{
          background: `conic-gradient(${color}, ${color})`,
          animation: playing
            ? "ppb-border 700ms ease-in-out 1 forwards"
            : "none",
        }}
      />
      {/* inner black disc */}
      <div className="absolute rounded-full bg-black pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[93%] h-[93%]" />

      {/* play triangle — collapses via clip-path when playing */}
      <div
        className="absolute pointer-events-none cursor-pointer"
        style={{
          width: icon,
          height: icon,
          left: "60%",
          top: "50%",
          backgroundColor: color,
          transform: "translate(-60%, -50%) rotate(90deg)",
          clipPath: playing
            ? "polygon(0 100%, 0% 100%, 100% 100%)"
            : "polygon(50% 15%, 0% 100%, 100% 100%)",
          transition: "all 400ms ease-in-out",
        }}
      />

      {/* pause bars — reveal with staggered delays when playing */}
      <div
        key={playing ? "on" : "off"}
        className="absolute pointer-events-none cursor-pointer left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: icon, height: icon }}
      >
        <div
          className="absolute top-0 h-full"
          style={{
            left: 0,
            backgroundColor: color,
            width: playing ? undefined : 0,
            animation: playing
              ? "ppb-reveal 300ms ease-in-out 350ms 1 forwards"
              : "none",
          }}
        />
        <div
          className="absolute top-0 h-full"
          style={{
            right: 0,
            backgroundColor: color,
            width: playing ? undefined : 0,
            animation: playing
              ? "ppb-reveal 300ms ease-in-out 600ms 1 forwards"
              : "none",
          }}
        />
      </div>
    </div>
  );
}
