import React from "react";
import { Link } from "react-router-dom";
import { thumbUrl } from "../../utilities/media";
import { formatTime, formatYear } from "../../utilities/formatters";
import VinylPlayerCard from "../../components/VinylPlayerCard";
import SurpriseMeButton from "../../components/SurpriseMeButton";
import { ROUTES } from "../../constants/routes";

export default function HeroCarousel({
  activeHero,
  featuredScenes,
  heroIdx,
  setHeroIdx,
  setIsHeroHovered,
  prevHero,
  nextHero,
  heroTracking,
  heroProgress,
  isResuming,
  randomPick,
  navigate,
  hasTrackProgress: hasTrackProgressProp,
}) {
  if (!activeHero) return null;

  const hasTrackProgress = hasTrackProgressProp ?? (isResuming || (heroProgress > 0 && !!heroTracking));

  return (
    <div
      onMouseEnter={() => setIsHeroHovered(true)}
      onMouseLeave={() => setIsHeroHovered(false)}
      className="relative w-full h-[62vh] min-h-[460px] max-h-[720px] group overflow-hidden bg-black"
    >
      {/* Backdrop Image Layer */}
      <div className="absolute inset-0 w-full h-full">
        <div
          key={activeHero._id}
          className="w-full h-full bg-cover bg-center scale-100 group-hover:scale-105 transition-all duration-1000 ease-out opacity-65 group-hover:opacity-75"
          style={{
            backgroundImage: `url(${thumbUrl(activeHero._id)})`,
          }}
        />
        {/* Multi-layered Cinematic Gradient Vignettes */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070708] via-[#070708]/75 via-35% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070708] via-[#070708]/85 via-45% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070708]/80 via-transparent via-20% to-transparent" />

        {/* Ambient Radial Accent Bloom */}
        <div className="absolute -top-20 -left-20 w-[600px] h-[600px] rounded-full bg-accent/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[450px] h-[350px] rounded-full bg-amber-500/5 blur-[100px] pointer-events-none" />
      </div>

      {/* Carousel Left/Right Floating Chevrons */}
      {featuredScenes.length > 1 && (
        <>
          <button
            onClick={prevHero}
            aria-label="Previous Featured Scene"
            className="absolute left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/40 hover:bg-black/75 border border-white/10 hover:border-white/30 text-white/70 hover:text-white backdrop-blur-md shadow-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={nextHero}
            aria-label="Next Featured Scene"
            className="absolute right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/40 hover:bg-black/75 border border-white/10 hover:border-white/30 text-white/70 hover:text-white backdrop-blur-md shadow-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Hero Content Left Area */}
      <div className="absolute inset-0 px-8 md:px-14 pb-12 flex flex-col justify-end z-20 pointer-events-none">
        <div className="max-w-3xl pointer-events-auto">
          {/* Badges / Studio / Resolution Ribbon */}
          <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
            {isResuming && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 backdrop-blur-md text-[11px] font-black text-accent uppercase tracking-widest shadow-[0_0_15px_rgba(245,179,1,0.25)]">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                Continue Watching
              </span>
            )}

            {activeHero.studio && (
              <Link
                to={ROUTES.studio(activeHero.studio_id || "")}
                className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md text-[11px] font-bold text-zinc-200 hover:text-white transition-all shadow-sm flex items-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <line x1="7" y1="3" x2="7" y2="21" />
                </svg>
                <span>{activeHero.studio}</span>
              </Link>
            )}

            {activeHero.resolution && (
              <span className="px-2.5 py-0.5 rounded-md bg-zinc-950/80 border border-white/15 backdrop-blur-md text-[10px] font-mono font-bold text-accent tracking-wider uppercase shadow-inner">
                {activeHero.resolution}
              </span>
            )}

            {activeHero.date && formatYear(activeHero.date) && (
              <span className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono font-medium text-zinc-400">
                {formatYear(activeHero.date)}
              </span>
            )}

            {activeHero.duration && (
              <span className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono font-medium text-zinc-400">
                {formatTime(activeHero.duration)}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display uppercase tracking-wider font-black text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] leading-[1.08] mb-4 line-clamp-2">
            {activeHero.title || activeHero.file_name}
          </h1>

          {/* Performer Tags in Hero */}
          {Array.isArray(activeHero.performers) && activeHero.performers.length > 0 && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Featuring:
              </span>
              {activeHero.performers.slice(0, 4).map((pName, i) => {
                const pid = activeHero.performer_ids?.[i];
                return pid ? (
                  <Link
                    key={pid}
                    to={ROUTES.performer(pid)}
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 hover:text-accent transition-all"
                  >
                    {pName}
                  </Link>
                ) : (
                  <span
                    key={i}
                    className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-400"
                  >
                    {pName}
                  </span>
                );
              })}
            </div>
          )}

          {/* Progress bar if scene is partially watched */}
          {hasTrackProgress && (
            <div className="max-w-md mb-4 bg-zinc-950/60 p-2.5 rounded-xl border border-white/10 backdrop-blur-md">
              <div className="flex justify-between text-[11px] font-mono text-zinc-300 mb-1.5">
                <span className="text-accent font-bold">
                  {Math.round(heroProgress)}% Watched
                </span>
                <span>{formatTime(heroTracking?.duration || activeHero.duration || 0)}</span>
              </div>
              <div className="w-full h-1.5 bg-black/60 border border-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full shadow-[0_0_10px_var(--color-accent)] transition-all duration-300"
                  style={{ width: `${heroProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Primary Action Button Bar */}
          <div className="flex items-center gap-3.5 flex-wrap pt-1">
            <Link
              to={isResuming ? ROUTES.scene(activeHero._id, { resume: "true" }) : ROUTES.scene(activeHero._id)}
              replace={true}
              state={isResuming ? { autoResume: true } : undefined}
              className="relative inline-flex items-center gap-3 px-8 py-3.5 rounded-xl bg-accent hover:brightness-110 text-zinc-950 font-black text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(245,179,1,0.4)] active:scale-95 transition-all cursor-pointer group/btn"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="transition-transform group-hover/btn:scale-125"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{isResuming ? "Resume Playing" : "Play Now"}</span>
            </Link>

            <Link
              to={ROUTES.LIBRARY}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-white/15 text-xs font-bold uppercase tracking-wider backdrop-blur-md transition-all active:scale-95 shadow-lg cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m16 6 4 14" />
                <path d="M12 6v14" />
                <path d="M8 8v12" />
                <path d="M4 4v16" />
              </svg>
              <span>Catalog</span>
            </Link>

            {randomPick && (
              <SurpriseMeButton
                title="Surprise Me (Shuffle)"
                onClick={() => navigate(ROUTES.scene(randomPick._id), { replace: true })}
              />
            )}
          </div>
        </div>
      </div>

      {/* Floating Vinyl Jukebox Dock (Top Right on Large Screens) */}
      <div className="absolute right-10 bottom-12 hidden xl:block z-20">
        <div className="p-3 rounded-2xl bg-zinc-950/70 hover:bg-zinc-950/90 backdrop-blur-2xl border border-white/10 hover:border-white/20 shadow-2xl transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-white/10">
            <span className="text-[10px] font-mono uppercase font-bold text-accent tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
              Now Featuring
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {heroIdx + 1} / {featuredScenes.length}
            </span>
          </div>
          <VinylPlayerCard
            scale={0.95}
            title={activeHero.title || activeHero.file_name}
            subtitle={activeHero.studio || ""}
            artwork={thumbUrl(activeHero._id)}
            progress={heroProgress}
            currentLabel={heroTracking ? formatTime(heroTracking.currentTime || 0) : "0:00"}
            durationLabel={
              heroTracking
                ? formatTime(heroTracking.duration || heroTracking.scene?.duration || 0)
                : ""
            }
            onPrev={prevHero}
            onNext={nextHero}
            onPlay={() =>
              navigate(
                isResuming ? ROUTES.scene(activeHero._id, { resume: "true" }) : ROUTES.scene(activeHero._id),
                { state: isResuming ? { autoResume: true } : undefined, replace: true }
              )
            }
            onShuffle={() => randomPick && navigate(ROUTES.scene(randomPick._id), { replace: true })}
            onQueue={() => navigate(ROUTES.LIBRARY)}
          />
        </div>
      </div>

      {/* Carousel Slide Indicators */}
      {featuredScenes.length > 1 && (
        <div className="absolute bottom-4 left-8 md:left-14 flex items-center gap-2 z-30">
          {featuredScenes.map((s, idx) => (
            <button
              key={s._id}
              onClick={() => setHeroIdx(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1.5 transition-all duration-300 rounded-full cursor-pointer ${
                idx === heroIdx % featuredScenes.length
                  ? "w-8 bg-accent shadow-[0_0_8px_var(--color-accent)]"
                  : "w-2 bg-white/25 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}

      {/* Glowing Horizon Border */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}
