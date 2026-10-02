import React from "react";

export default function SystemDiagnosticsCard({ rows, onScanHealth }) {
  return (
    <div className="bg-zinc-950/70 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden mb-6 shadow-xl">
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-200">
          System Environment
        </span>
        <button
          onClick={onScanHealth}
          className="text-[11px] font-bold uppercase tracking-wider text-accent hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>Scan Library Health</span>
          <span>→</span>
        </button>
      </div>

      <div className="divide-y divide-white/5">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={`flex items-center justify-between px-6 py-3 transition-colors ${
              i % 2 === 1 ? "bg-white/[0.015]" : ""
            } hover:bg-white/[0.03]`}
          >
            <span className="text-xs font-medium text-zinc-400">{k}</span>
            <span className="text-xs font-mono text-zinc-200 truncate max-w-[65%] text-right select-all">
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
