import React from "react";

export default function PerformerAttributes({
  performer,
  attributes = {},
  hasAttributes = false,
  showAbout = true,
  setShowAbout,
}) {
  if (!hasAttributes && !performer?.bio) return null;

  return (
    <div className="relative group rounded-2xl border border-white/10 bg-zinc-950/60 p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
          Personal Information
        </h2>
        {performer.bio && (
          <button
            onClick={() => setShowAbout((v) => !v)}
            className="text-[11px] font-mono text-accent hover:underline cursor-pointer"
          >
            {showAbout ? "Hide Bio" : "Show Bio"}
          </button>
        )}
      </div>

      {showAbout && performer.bio && (
        <p className="text-xs text-zinc-400 leading-relaxed mb-4 border-b border-white/5 pb-3">
          {performer.bio}
        </p>
      )}

      {hasAttributes && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {attributes.hair_color && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Hair</div>
              <div className="text-zinc-200 font-medium">{attributes.hair_color}</div>
            </div>
          )}
          {attributes.eye_color && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Eyes</div>
              <div className="text-zinc-200 font-medium">{attributes.eye_color}</div>
            </div>
          )}
          {attributes.height && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Height</div>
              <div className="text-zinc-200 font-medium">{attributes.height}</div>
            </div>
          )}
          {attributes.weight && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Weight</div>
              <div className="text-zinc-200 font-medium">{attributes.weight}</div>
            </div>
          )}
          {attributes.measurements && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Measurements</div>
              <div className="text-zinc-200 font-medium">{attributes.measurements}</div>
            </div>
          )}
          {attributes.ethnicity && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Ethnicity</div>
              <div className="text-zinc-200 font-medium">{attributes.ethnicity}</div>
            </div>
          )}
          {attributes.birthdate && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Birthdate</div>
              <div className="text-zinc-200 font-medium">{attributes.birthdate}</div>
            </div>
          )}
          {attributes.aliases && Array.isArray(attributes.aliases) && attributes.aliases.length > 0 && (
            <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5 col-span-2">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-mono">Aliases</div>
              <div className="text-zinc-200 font-medium truncate">{attributes.aliases.join(", ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
