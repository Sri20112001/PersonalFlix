import React from "react";

export default function Button({
  children,
  variant = "surface", // "accent" | "surface" | "glass" | "ghost" | "danger"
  size = "md", // "sm" | "md" | "lg"
  className = "",
  disabled = false,
  onClick,
  type = "button",
  title,
  icon,
  ...props
}) {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed";

  const sizeStyles = {
    sm: "px-2.5 py-1 text-[11px] rounded",
    md: "px-3.5 py-2 text-xs rounded-lg",
    lg: "px-5 py-3 text-sm rounded-xl",
  }[size] || "px-3.5 py-2 text-xs rounded-lg";

  const variantStyles = {
    accent: "bg-accent hover:bg-[#FFC52F] text-black font-extrabold shadow-md",
    surface: "bg-surface hover:bg-surfaceHover border border-white/10 text-white",
    glass: "bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur",
    ghost: "text-textSecondary hover:text-white hover:bg-white/5",
    danger: "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30",
  }[variant] || "bg-surface hover:bg-surfaceHover border border-white/10 text-white";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
