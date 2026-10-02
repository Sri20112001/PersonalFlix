import React from "react";
import { useNavigate } from "react-router-dom";
import { formatTime } from "../../utilities/formatters";
import { ROUTES } from "../../constants/routes";

/**
 * Cross-video performer links: chapters + comments tagged with this
 * performer, even in scenes they are not cast in.
 */
export default function TaggedAppearances({ chapters = [], comments = [] }) {
  const navigate = useNavigate();
  if ((chapters || []).length === 0 && (comments || []).length === 0) return null;

  const jump = (sceneId, seconds) => {
    navigate(ROUTES.scene(sceneId), {
      state: { seekTarget: seconds, autoResume: true },
    });
  };

  return (
    <div className="rounded-3xl border border-accent/25 bg-zinc-950/70 p-6 md:p-7 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3 mb-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 text-accent font-mono font-bold">
          @
        </div>
        <div>
          <h3 className="font-display text-base font-black uppercase tracking-wider text-white">
            Tagged appearances
          </h3>
          <p className="text-xs text-zinc-400">
            Chapters & notes mentioning this performer — including scenes they
            aren&apos;t cast in
          </p>
        </div>
      </div>

      {(chapters || []).length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Chapters ({chapters.length})
          </div>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {chapters.map((c) => (
              <button
                key={`ch-${c._id}`}
                type="button"
                onClick={() => jump(c.scene_id, c.seconds)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 hover:border-accent/50 hover:bg-white/[0.05] transition-all cursor-pointer text-left group"
              >
                <span className="text-[11px] font-mono text-accent bg-accent/10 border border-accent/30 px-1.5 py-0.5 rounded flex-shrink-0">
                  {formatTime(c.seconds || 0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-white truncate group-hover:text-accent">
                    {c.label || "Chapter"}
                  </span>
                  <span className="block text-[10px] font-mono text-zinc-500 truncate">
                    {c.scene_title || `Scene ${c.scene_id}`}
                    {c.scene_studio ? ` · ${c.scene_studio}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(comments || []).length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Notes ({comments.length})
          </div>
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {comments.map((c) => (
              <button
                key={`cm-${c._id}`}
                type="button"
                onClick={() => jump(c.scene_id, 0)}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 hover:border-accent/50 transition-all cursor-pointer text-left"
              >
                <span className="block text-xs text-zinc-200 break-words">
                  {c.text}
                </span>
                <span className="block text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                  {c.scene_title || `Scene ${c.scene_id}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
