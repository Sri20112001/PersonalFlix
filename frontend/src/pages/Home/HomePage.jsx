import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../../api/apiClient";
import { formatTime } from "../../utilities/formatters";
import VideoCard from "../../components/VideoCard";
import Rail from "../../components/Rail";
import Spinner from "../../components/Spinner";
import HeroCarousel from "./HeroCarousel";
import QuickNavRibbon from "./QuickNavRibbon";
import PerformersRail from "./PerformersRail";
import StudiosRail from "./StudiosRail";
import EmptyCatalog from "./EmptyCatalog";
import {
  ClockIcon,
  SparklesIcon,
  HeartIcon,
  StarIcon,
  FilmIcon,
} from "../../utilities/icons";
import { useHome } from "../../hooks/useHome";
import { ROUTES } from "../../constants/routes";

export default function HomePage() {
  const navigate = useNavigate();
  const {
    continueList,
    recent,
    unwatched,
    favScenes,
    watched,
    performers,
    studios,
    because,
    randomPick,
    heroIdx,
    setHeroIdx,
    setIsHeroHovered,
    activeFilter,
    loading,
    featuredScenes,
    activeHero,
    nextHero,
    prevHero,
    progressOf,
    scrollToSection,
    heroTracking,
    heroProgress,
  } = useHome();

  const [totalWatch, setTotalWatch] = useState(null);
  useEffect(() => {
    api.analytics().then((d) => setTotalWatch(d)).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#070708] gap-3">
        <Spinner />
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest animate-pulse">
          Loading PersonalFlix...
        </span>
      </div>
    );
  }

  const isResuming = heroProgress > 0 && heroTracking?.currentTime > 0;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-[#070708] text-white select-none custom-scrollbar pb-16">
      {/* 1. Cinematic Hero Marquee Carousel */}
      <HeroCarousel
        activeHero={activeHero}
        featuredScenes={featuredScenes}
        heroIdx={heroIdx}
        setHeroIdx={setHeroIdx}
        setIsHeroHovered={setIsHeroHovered}
        prevHero={prevHero}
        nextHero={nextHero}
        heroTracking={heroTracking}
        heroProgress={heroProgress}
        isResuming={isResuming}
        hasTrackProgress={isResuming}
        randomPick={randomPick}
        navigate={navigate}
      />

      {/* 2. Quick Section Jump Ribbon */}
      <QuickNavRibbon
        activeFilter={activeFilter}
        scrollToSection={scrollToSection}
        hasContinue={continueList.length > 0}
        hasRecent={recent.length > 0}
        hasPerformers={performers.length > 0}
        hasStudios={studios.length > 0}
        hasFavorites={favScenes.length > 0}
        hasUnwatched={unwatched.length > 0}
        hasWatched={watched.length > 0}
      />

      {/* Total view time strip */}
      {totalWatch && (
        <div className="px-8 md:px-14 pt-6 relative z-10">
          <Link
            to={ROUTES.ANALYTICS}
            className="flex items-center gap-4 px-4 py-3 rounded-xl bg-surface border border-white/10 hover:border-accent/40 transition-colors group w-fit"
            title="Open analytics"
          >
            <span className="flex items-center gap-2 text-accent">
              <ClockIcon size={16} strokeWidth={2.5} />
            </span>
            <span className="text-sm font-mono text-white">
              {formatTime(
                (totalWatch.watchTimeExact?.events || 0) > 0
                  ? totalWatch.watchTimeExact.total || 0
                  : totalWatch.secondsWatched || totalWatch.watchTime?.total || 0
              )}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-textSecondary">
              total view time
            </span>
            {((totalWatch.watchTimeExact?.events || 0) > 0
              ? totalWatch.watchTimeExact.today
              : totalWatch.watchTime?.today || 0) > 0 && (
              <span className="text-[11px] font-mono text-textSecondary">
                ·{" "}
                {formatTime(
                  (totalWatch.watchTimeExact?.events || 0) > 0
                    ? totalWatch.watchTimeExact.today || 0
                    : totalWatch.watchTime?.today || 0
                )}{" "}
                today
              </span>
            )}
            <span className="text-[10px] font-mono text-accent opacity-0 group-hover:opacity-100 transition-opacity">
              Analytics →
            </span>
          </Link>
        </div>
      )}

      {/* 3. Media Rails Container */}
      <div className="px-8 md:px-14 py-8 flex flex-col gap-10 relative z-10">
        {/* Continue Watching Rail */}
        {continueList.length > 0 && (
          <div id="section-continue">
            <Rail
              title="Continue Watching"
              subtitle="Pick up where you left off"
              count={continueList.length}
              actionLink={`${ROUTES.LIBRARY}?tab=watching`}
              actionLabel="View All"
              icon={<ClockIcon size={18} strokeWidth={2.5} />}
            >
              {continueList.map((t) => (
                <VideoCard
                  key={t.scene_id}
                  scene={t.scene}
                  width={310}
                  height={175}
                  showProgress
                  progress={progressOf(t.scene_id)}
                  autoResume
                />
              ))}
            </Rail>
          </div>
        )}

        {/* Recently Added Rail */}
        {recent.length > 0 && (
          <div id="section-recent">
            <Rail
              title="Recently Added"
              subtitle="Fresh arrivals to your library"
              count={recent.length}
              actionLink={`${ROUTES.LIBRARY}?sort=recent`}
              actionLabel="Catalog"
              icon={<SparklesIcon size={18} strokeWidth={2.5} />}
            >
              {recent.map((s, i) => (
                <VideoCard key={s._id} scene={s} width={310} height={175} showNew={i === 0} />
              ))}
            </Rail>
          </div>
        )}

        {/* Featured Performers Spotlight Ribbon */}
        <PerformersRail performers={performers} />

        {/* Contextual Recommendation: Because You Watched */}
        {because.scenes.length > 0 && (
          <Rail
            title={`Because you watched ${because.label}`}
            subtitle="Recommendations matched to your taste"
            count={because.scenes.length}
            actionLink={because.studioId ? ROUTES.studio(because.studioId) : ROUTES.LIBRARY}
            actionLabel="View Studio"
            icon={<HeartIcon size={18} strokeWidth={2.5} />}
          >
            {because.scenes.map((s) => (
              <VideoCard key={s._id} scene={s} width={310} height={175} />
            ))}
          </Rail>
        )}

        {/* Top Studios Spotlight Rail */}
        <StudiosRail studios={studios} />

        {/* Your Favorites Rail */}
        {favScenes.length > 0 && (
          <div id="section-favorites">
            <Rail
              title="Your Favorites"
              subtitle="Scenes you've marked as favorites"
              count={favScenes.length}
              actionLink={ROUTES.FAVORITES}
              actionLabel="Favorites"
              icon={<StarIcon size={18} strokeWidth={2.5} />}
            >
              {favScenes.map((s) => (
                <VideoCard key={s._id} scene={s} width={310} height={175} />
              ))}
            </Rail>
          </div>
        )}

        {/* Unwatched Discoveries */}
        {unwatched.length > 0 && (
          <div id="section-unwatched">
            <Rail
              title="Unwatched Discoveries"
              subtitle="Fresh content waiting to be experienced"
              count={unwatched.length}
              actionLink={`${ROUTES.LIBRARY}?tab=unwatched`}
              actionLabel="Explore"
              icon={<FilmIcon size={18} strokeWidth={2.5} />}
            >
              {unwatched.map((s) => (
                <VideoCard key={s._id} scene={s} width={310} height={175} />
              ))}
            </Rail>
          </div>
        )}

        {/* Recently Watched History */}
        {watched.length > 0 && (
          <div id="section-watched">
            <Rail
              title="Recently Watched"
              subtitle="Revisit your past sessions"
              count={watched.length}
              actionLink={ROUTES.HISTORY}
              actionLabel="History"
              icon={<ClockIcon size={18} strokeWidth={2.5} />}
            >
              {watched.map((t) => (
                <VideoCard key={t.scene_id} scene={t.scene} width={310} height={175} />
              ))}
            </Rail>
          </div>
        )}

        {/* Empty Catalog State */}
        {continueList.length === 0 && recent.length === 0 && <EmptyCatalog />}
      </div>
    </div>
  );
}
