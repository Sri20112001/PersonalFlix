import React from "react";

// Rolling-dice "Surprise Me" button. Pure React + Tailwind — no
// styled-components dependency. The die is a 54px pip grid scaled into an
// 18px box; raw CSS is used only for the pip background + keyframes, which
// Tailwind can't express.
const PIPS = [
  "radial-gradient(circle 5px, #19191a 100%, transparent 0)",
  "radial-gradient(circle 5px, #19191a 100%, transparent 0)",
  "radial-gradient(circle 5px, #19191a 100%, transparent 0)",
  "radial-gradient(circle 5px, #19191a 100%, transparent 0)",
  "radial-gradient(circle 5px, #19191a 100%, transparent 0)",
  "radial-gradient(circle 5px, #19191a 100%, transparent 0)",
].join(", ");

export default function SurpriseMeButton({ onClick, title = "Play a random scene (Ctrl+Shift+R)" }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 hover:border-white/20 text-xs font-bold uppercase tracking-widest transition-all duration-200 shadow-md active:scale-95 cursor-pointer"
    >
      <style>{`
        @keyframes dice-rotate {
          0%, 20% { transform: rotate(0deg); }
          30%, 40% { transform: rotate(90deg); }
          50%, 60% { transform: rotate(180deg); }
          70%, 80% { transform: rotate(270deg); }
          90%, 100% { transform: rotate(360deg); }
        }
        @keyframes dice-move {
          0%, 9% { background-position: -12px -15px, -12px 0px, -12px 15px, 12px -15px, 12px 0px, 12px 15px; }
          10%, 25% { background-position: 0px -15px, -12px 0px, -12px 15px, 34px -15px, 12px 0px, 12px 15px; }
          30%, 45% { background-position: 0px -34px, -12px -10px, -12px 12px, 34px -15px, 12px -10px, 12px 12px; }
          50%, 65% { background-position: 0px -34px, -12px -34px, -12px 12px, 34px -12px, 0px -10px, 12px 12px; }
          70%, 85% { background-position: 0px -34px, -12px -34px, 0px 12px, 34px -12px, 0px -10px, 34px 12px; }
          90%, 100% { background-position: 0px -34px, -12px -34px, 0px 0px, 34px -12px, 0px 0px, 34px 12px; }
        }
      `}</style>
      <span className="inline-flex items-center justify-center w-[18px] h-[18px]">
        <span
          aria-hidden
          className="relative rounded-[8px] bg-white bg-no-repeat w-[54px] h-[54px] origin-center animate-[dice-move_4s_linear_infinite,dice-rotate_2s_linear_infinite]"
          style={{ scale: "0.33", backgroundImage: PIPS }}
        />
      </span>
      <span className="text-zinc-200 group-hover:text-white transition-colors">
        Surprise Me
      </span>
    </button>
  );
}
