import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/apiClient";
import Spinner from "../../ui/Spinner";
import { ROUTES } from "../../constants/routes";

import PerformerHero from "./PerformerHero";
import PerformerEditModal from "./PerformerEditModal";
import CoStarsSection from "./CoStarsSection";
import PerformerAttributes from "./PerformerAttributes";
import FilmographySection from "./FilmographySection";
import TaggedAppearances from "./TaggedAppearances";

export default function Performer() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [p, setP] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [studios, setStudios] = useState([]);
  const [coStars, setCoStars] = useState([]);
  const [stats, setStats] = useState(null);
  const [taggedChapters, setTaggedChapters] = useState([]);
  const [taggedComments, setTaggedComments] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imgErr, setImgErr] = useState(false);
  const [showAbout, setShowAbout] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  // Scene search & filter state
  const [sceneSearch, setSceneSearch] = useState("");
  const [sceneSort, setSceneSort] = useState("recent");
  const [selectedStudio, setSelectedStudio] = useState("all");
  const [selectedResolution, setSelectedResolution] = useState("all");
  const [selectedCoStar, setSelectedCoStar] = useState(null);
  const [selectedYear, setSelectedYear] = useState("all");

  // Filmography timeline year breakdown
  const yearBreakdown = useMemo(() => {
    const map = new Map();
    scenes.forEach((s) => {
      if (s.date) {
        const y = String(s.date).slice(0, 4);
        if (/^\d{4}$/.test(y)) {
          map.set(y, (map.get(y) || 0) + 1);
        }
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [scenes]);

  // Enhanced co-stars with computed collaboration stats
  const coStarsWithStats = useMemo(() => {
    if (!coStars || coStars.length === 0) return [];
    return coStars.map((cs) => {
      const csId = String(cs._id);
      const csName = (cs.name || "").toLowerCase();
      const mutualScenes = scenes.filter((s) => {
        if (s.performer_ids && s.performer_ids.map(String).includes(csId)) return true;
        if (
          s.performers &&
          s.performers.some(
            (perf) =>
              String(perf._id || perf) === csId ||
              (perf.name && perf.name.toLowerCase() === csName)
          )
        )
          return true;
        if (
          csName &&
          ((s.title || "").toLowerCase().includes(csName) ||
            (s.file_name || "").toLowerCase().includes(csName))
        )
          return true;
        return false;
      });
      const mutualDuration = mutualScenes.reduce((sum, s) => sum + (s.duration || 0), 0);
      return {
        ...cs,
        mutualScenesCount: mutualScenes.length || cs.count || 1,
        mutualDuration,
      };
    });
  }, [coStars, scenes]);

  const loadPerformer = async () => {
    setLoading(true);
    setImgErr(false);
    try {
      const [perRes, favList] = await Promise.all([
        api.performer(id),
        api.favorites().catch(() => []),
      ]);

      const performerData = perRes?.performer || perRes;
      setP(performerData);
      setScenes(perRes?.scenes || []);
      setCategories(perRes?.categories || []);
      setStudios(perRes?.studios || []);
      setCoStars(perRes?.co_stars || []);
      setStats(perRes?.stats || null);
      setTaggedChapters(perRes?.tagged_chapters || []);
      setTaggedComments(perRes?.tagged_comments || []);
      setFavorites(
        (favList || []).filter((f) => f.type === "performer").map((f) => String(f.target_id))
      );
    } catch (e) {
      console.error("Failed to load performer data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPerformer();
  }, [id]);

  const isFav = favorites.includes(String(id));

  const toggleFavorite = async (e) => {
    e?.stopPropagation();
    const pid = String(id);
    if (isFav) {
      setFavorites((prev) => prev.filter((x) => x !== pid));
      try {
        await api.removeFavorite("performer", pid);
      } catch (err) {
        console.error("Remove favorite failed", err);
        setFavorites((prev) => [...prev, pid]);
      }
    } else {
      setFavorites((prev) => [...prev, pid]);
      try {
        await api.addFavorite("performer", pid, p?.name || pid);
      } catch (err) {
        console.error("Add favorite failed", err);
        setFavorites((prev) => prev.filter((x) => x !== pid));
      }
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(ROUTES.PERFORMERS);
    }
  };

  const playRandom = () => {
    if (!scenes || scenes.length === 0) return;
    const randomScene = scenes[Math.floor(Math.random() * scenes.length)];
    if (randomScene && randomScene._id) {
      navigate(ROUTES.scene(randomScene._id));
    }
  };

  const filteredScenes = useMemo(() => {
    let result = [...scenes];

    if (sceneSearch.trim()) {
      const q = sceneSearch.trim().toLowerCase();
      result = result.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(q) ||
          (s.file_name || "").toLowerCase().includes(q) ||
          (s.studio || "").toLowerCase().includes(q)
      );
    }

    if (selectedCoStar) {
      const csId = String(selectedCoStar._id);
      const csName = (selectedCoStar.name || "").toLowerCase();
      result = result.filter((s) => {
        if (s.performer_ids && s.performer_ids.map(String).includes(csId)) return true;
        if (
          s.performers &&
          s.performers.some(
            (perf) =>
              String(perf._id || perf) === csId ||
              (perf.name && perf.name.toLowerCase() === csName)
          )
        )
          return true;
        if (
          csName &&
          ((s.title || "").toLowerCase().includes(csName) ||
            (s.file_name || "").toLowerCase().includes(csName))
        )
          return true;
        return false;
      });
    }

    if (selectedYear !== "all") {
      result = result.filter((s) => s.date && String(s.date).startsWith(selectedYear));
    }

    if (selectedStudio !== "all") {
      result = result.filter(
        (s) => String(s.studio_id) === String(selectedStudio) || s.studio === selectedStudio
      );
    }

    if (selectedResolution !== "all") {
      result = result.filter(
        (s) => (s.resolution || "").toLowerCase() === selectedResolution.toLowerCase()
      );
    }

    result.sort((a, b) => {
      if (sceneSort === "recent") return (b.mtime || 0) - (a.mtime || 0);
      if (sceneSort === "date-desc") return (b.date || "").localeCompare(a.date || "");
      if (sceneSort === "date-asc") return (a.date || "").localeCompare(b.date || "");
      if (sceneSort === "title-asc") {
        const titleA = a.title || a.file_name || "";
        const titleB = b.title || b.file_name || "";
        return titleA.localeCompare(titleB, undefined, { sensitivity: "base" });
      }
      if (sceneSort === "duration-desc") return (b.duration || 0) - (a.duration || 0);
      if (sceneSort === "size-desc") return (b.size_bytes || 0) - (a.size_bytes || 0);
      return 0;
    });

    return result;
  }, [scenes, sceneSearch, sceneSort, selectedStudio, selectedResolution, selectedCoStar, selectedYear]);

  const rawAttrs = p?.attributes;
  const attributes = typeof rawAttrs === "object" && rawAttrs !== null ? rawAttrs : {};
  const hasAttributes =
    Boolean(p?.country) ||
    Boolean(p?.gender) ||
    Object.values(attributes).some((v) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <Spinner />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="pt-6 px-10 flex flex-col items-center justify-center h-full gap-4 text-center bg-zinc-950">
        <div className="text-xl text-zinc-200 font-medium">Performer not found</div>
        <button
          onClick={() => navigate(ROUTES.PERFORMERS)}
          className="relative inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-mono font-bold tracking-widest text-zinc-950 bg-accent hover:shadow-[0_0_25px_rgba(255,255,255,0.25)] transition-all cursor-pointer active:scale-95"
        >
          Back to Performers
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-y-auto select-none custom-scrollbar">
      <PerformerHero
        performer={p}
        imgErr={imgErr}
        setImgErr={setImgErr}
        scenesCount={scenes.length}
        studiosCount={studios.length}
        stats={stats}
        isFav={isFav}
        onToggleFavorite={toggleFavorite}
        onPlayRandom={playRandom}
        onBack={handleBack}
        onEdit={() => setShowEdit(true)}
      />

      {showEdit && (
        <PerformerEditModal
          key={p._id || p.id}
          performer={p}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            loadPerformer();
          }}
        />
      )}

      <div className="px-8 md:px-12 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CoStarsSection
            coStarsWithStats={coStarsWithStats}
            selectedCoStar={selectedCoStar}
            onSelectCoStar={setSelectedCoStar}
          />
          <PerformerAttributes
            performer={p}
            attributes={attributes}
            hasAttributes={hasAttributes}
            showAbout={showAbout}
            setShowAbout={setShowAbout}
          />
        </div>

        <TaggedAppearances chapters={taggedChapters} comments={taggedComments} />

        <FilmographySection
          rawScenes={scenes}
          filteredScenes={filteredScenes}
          totalScenesCount={scenes.length}
          stats={stats}
          yearBreakdown={yearBreakdown}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          selectedCoStar={selectedCoStar}
          onClearCoStar={() => setSelectedCoStar(null)}
          selectedStudio={selectedStudio}
          onSelectStudio={setSelectedStudio}
          studios={studios}
          selectedResolution={selectedResolution}
          onSelectResolution={setSelectedResolution}
          sceneSearch={sceneSearch}
          setSceneSearch={setSceneSearch}
          sceneSort={sceneSort}
          setSceneSort={setSceneSort}
          onResetAllFilters={() => {
            setSelectedCoStar(null);
            setSelectedYear("all");
            setSelectedStudio("all");
            setSelectedResolution("all");
            setSceneSearch("");
          }}
        />
      </div>
    </div>
  );
}
