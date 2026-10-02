import React, { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function Rail({
  title,
  subtitle,
  count,
  actionLink,
  actionLabel = "See All",
  icon,
  className = "",
  children,
}) {
  const railRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (!railRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = railRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = railRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll, { passive: true });
      window.addEventListener("resize", checkScroll);
    }
    return () => {
      if (el) el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [children]);

  const scroll = (direction) => {
    if (!railRef.current) return;
    const amount = railRef.current.clientWidth * 0.75;
    railRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <section className={`flex flex-col select-none group/rail relative ${className}`}>
      {/* Rail Header */}
      {(title || actionLink) && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-accent flex items-center">{icon}</span>}
            {title && (
              <h3 className="text-lg md:text-xl font-display uppercase tracking-wider text-white flex items-center gap-2.5">
                <span>{title}</span>
                {count !== undefined && count !== null && (
                  <span className="text-[11px] font-sans font-bold px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/5 tracking-normal">
                    {count}
                  </span>
                )}
              </h3>
            )}
            {subtitle && (
              <span className="text-xs text-zinc-400 font-medium hidden sm:inline ml-1">
                • {subtitle}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {actionLink && (
              <Link
                to={actionLink}
                className="text-xs font-bold text-zinc-400 hover:text-accent uppercase tracking-wider transition-colors flex items-center gap-1 group/link"
              >
                <span>{actionLabel}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="transition-transform group-hover/link:translate-x-1"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Rail Track with Chevrons */}
      <div className="relative">
        {/* Left scroll chevron */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className="absolute left-0 top-1/2 -translate-y-1/2 -ml-3 z-30 w-10 h-10 rounded-full bg-zinc-950/85 hover:bg-zinc-900 border border-white/20 text-white backdrop-blur-xl shadow-2xl flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={railRef}
          className="flex gap-4 rail-container overflow-x-auto pb-4 pt-1 px-1 scroll-smooth"
        >
          {children}
        </div>

        {/* Right scroll chevron */}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-3 z-30 w-10 h-10 rounded-full bg-zinc-950/85 hover:bg-zinc-900 border border-white/20 text-white backdrop-blur-xl shadow-2xl flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}