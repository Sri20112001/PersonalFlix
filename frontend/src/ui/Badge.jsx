import React from "react";

export default function Badge({
  children,
  variant = "default", // "default" | "accent" | "resolution" | "status"
  className = "",
}) {
  const variantStyles = {
    default: "bg-white/10 text-white border border-white/10",
    accent: "bg-accent text-black font-extrabold shadow-sm",
    resolution: "bg-black/70 text-white/90 border border-white/10 font-mono uppercase font-bold",
    status: "bg-surface text-textSecondary border border-white/10",
  }[variant] || "bg-white/10 text-white";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider ${variantStyles} ${className}`}
    >
      {children}
    </span>
  );
}
