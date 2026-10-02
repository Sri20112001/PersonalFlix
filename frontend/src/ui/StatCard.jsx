import React, { useState } from "react";
import { ArrowUpRightIcon } from "../utilities/icons";

// Converted from a Uiverse styled-components card to pure React + Tailwind
// (no styled-components dependency). Re-themed to PersonalFlix: surface card,
// amber→red header gradient, display font title.
export default function StatCard({
  title = "",
  initial = "?",
  image = null,
  stats = [],
  gradient = "linear-gradient(45deg, #F5B301 0%, #E50914 100%)",
  onOpen,
}) {
  const [imgOk, setImgOk] = React.useState(true);
  const showImg = Boolean(image) && imgOk;
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-[20px] bg-[var(--cardbg)] p-[5px] overflow-hidden text-left transition-transform duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:scale-[1.03] shadow-[rgba(0,0,0,0.4)_0px_7px_20px_0px] cursor-pointer"
      style={{ "--cardbg": "#141415" }}
    >
      {/* top section with skewed tab cut-out */}
      <div
        className="h-[150px] rounded-[15px] flex flex-col relative overflow-hidden before:content-[''] before:absolute before:top-[30px] before:left-0 before:w-[15px] before:h-[15px] before:rounded-tl-[15px] before:shadow-[-5px_-5px_0_2px_var(--cardbg)]"
        style={{ background: gradient }}
      >
        <div className="h-[30px] w-[130px] bg-[var(--cardbg)] relative -skew-x-[40deg] rounded-br-[10px] shadow-[-10px_-10px_0_0_var(--cardbg)] before:content-[''] before:absolute before:w-[15px] before:h-[15px] before:top-0 before:-right-[15px] before:rounded-tl-[10px] before:shadow-[-5px_-5px_0_2px_var(--cardbg)]" />
        <div className="absolute top-0 w-full h-[30px] flex justify-between">
          <div className="h-full aspect-square py-[7px] pl-[15px]">
            <span className="flex items-center justify-center h-full aspect-square rounded-full bg-black/45 text-white font-display text-sm tracking-widest">
              {String(initial || "?").slice(0, 1).toUpperCase()}
            </span>
          </div>
          <div className="h-full px-[15px] py-2 flex items-center">
            <ArrowUpRightIcon size={16} stroke="#141415" />
          </div>
        </div>
        {showImg && (
          <div className="absolute inset-x-0 top-[30px] bottom-0 flex items-center justify-center px-8 pb-3">
            <img
              src={image}
              alt={`${title} logo`}
              className="max-h-full max-w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]"
              loading="lazy"
              onError={() => setImgOk(false)}
            />
          </div>
        )}
      </div>
      <div className="mt-[15px] px-[5px] pb-[10px]">
        <span className="block text-[17px] font-display uppercase text-white text-center tracking-[2px] truncate">
          {title}
        </span>
        <div className="flex justify-between mt-5">
          {stats.slice(0, 3).map((s, i) => (
            <div
              key={i}
              className={`flex-[30%] text-center p-[5px] ${
                i === 1 ? "border-l border-r border-white/10" : ""
              }`}
            >
              <span
                className={`text-xs block font-bold font-mono ${
                  s.alert ? "text-[#F87171]" : "text-white"
                }`}
              >
                {s.value}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-textSecondary">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}
