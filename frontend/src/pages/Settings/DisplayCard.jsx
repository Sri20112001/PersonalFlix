import React, { useState } from "react";
import {
  isLightBlockerOn,
  isNightShieldOn,
  setLightBlockerOn,
  setNightShieldOn,
} from "../../utilities/lightBlocker";

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${
        checked ? "bg-accent shadow-md shadow-accent/30" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export default function DisplayCard() {
  const [blockerOn, setBlockerOn] = useState(isLightBlockerOn);
  const [warmOn, setWarmOn] = useState(isNightShieldOn);

  const handleBlocker = (on) => {
    setBlockerOn(on);
    setLightBlockerOn(on);
  };

  const handleWarm = (on) => {
    setWarmOn(on);
    setNightShieldOn(on);
  };

  return (
    <div className="bg-zinc-950/70 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 shadow-xl">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-200">
          Display & Light Blocker
        </h2>
      </div>
      <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
        Dim the interface with the Light-Blocker overlay
        (pseudo-element layer). Video and images stay full-brightness on top
        of it. Optionally warm it with Night Shift to cut
        harsh blue light. Applies instantly and persists across restarts.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-white">Light-Blocker Overlay</div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Darkens everything behind video and UI
            </div>
          </div>
          <Toggle checked={blockerOn} onChange={handleBlocker} label="Light-Blocker Overlay" />
        </div>

        <div
          className={`flex items-center justify-between gap-4 transition-opacity ${
            blockerOn ? "" : "opacity-40 pointer-events-none"
          }`}
        >
          <div>
            <div className="text-xs font-bold text-white">Warm Night Shift</div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Amber tint on top of the blocker
            </div>
          </div>
          <Toggle checked={warmOn} onChange={handleWarm} label="Warm Night Shift" />
        </div>
      </div>
    </div>
  );
}
