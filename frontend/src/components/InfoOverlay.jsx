import React from "react";
import SceneInfoPanel from "./SceneInfoPanel";

export default function InfoOverlay({ open, onClose, ...props }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="absolute right-0 top-0 bottom-0 w-[420px] max-w-[90vw] overlay-glass border-l border-white/10 overflow-hidden slide-in-right z-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <SceneInfoPanel {...props} onClosePanel={onClose} />
      </div>
    </div>
  );
}