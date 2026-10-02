import React from "react";
import { ALPHABET_LETTERS } from "../../constants/status";

export default function AlphabetNav({
  groups = {},
  onScrollToLetter,
}) {
  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto py-1.5 px-3 bg-zinc-950/60 backdrop-blur-md rounded-xl border border-white/10 text-[11px] font-mono scrollbar-none shadow-md">
      {ALPHABET_LETTERS.map((l) => {
        const count = groups && groups[l] ? groups[l].length : 0;
        return (
          <button
            key={l}
            onClick={() => count > 0 && onScrollToLetter(l)}
            disabled={count === 0}
            className={`w-7 h-7 flex items-center justify-center rounded-lg font-bold transition-all ${
              count > 0
                ? "text-zinc-300 hover:text-white hover:bg-white/10 hover:border hover:border-white/20 hover:scale-110 active:scale-95 cursor-pointer shadow-sm"
                : "text-zinc-700 cursor-default"
            }`}
            title={count > 0 ? `${count} performers starting with ${l}` : "No performers"}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
