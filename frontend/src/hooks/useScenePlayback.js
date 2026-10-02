import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../api/apiClient";
import { useNavQueueStore } from "../stores/navQueueStore";
import { ROUTES } from "../constants/routes";

export function useScenePlayback() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const autoResume = searchParams.get("resume") === "true" || location.state?.autoResume === true;

  const [scene, setScene] = useState(null);
  const [performers, setPerformers] = useState([]);
  const [studio, setStudio] = useState(null);
  const [categories, setCategories] = useState([]);
  const [timestamps, setTimestamps] = useState([]);
  const [comments, setComments] = useState([]);
  const [navIds, setNavIds] = useState(() => {
    try {
      if (location.state?.sceneList && Array.isArray(location.state.sceneList) && location.state.sceneList.length > 0) {
        return location.state.sceneList.map(String);
      }
      const raw = sessionStorage.getItem("pfx-nav-scenes");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String);
      }
    } catch (e) {}
    return [];
  });
  const [status, setStatus] = useState("");
  const [favorite, setFavorite] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [plBusy, setPlBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [seekTarget, setSeekTarget] = useState(null);
  const [resumeFrom, setResumeFrom] = useState(0);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recs, setRecs] = useState([]);
  const lastStatus = useRef("");

  // Deep link from tagged chapters / details: { seekTarget, autoResume }.
  useEffect(() => {
    const st = location.state?.seekTarget;
    if (st != null && !Number.isNaN(Number(st))) setSeekTarget(Number(st));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location.state?.seekTarget]);

  // Sync / Ensure navIds contains current scene id and stays fresh
  useEffect(() => {
    (async () => {
      let currentList = navIds;
      if (location.state?.sceneList && Array.isArray(location.state.sceneList) && location.state.sceneList.length > 0) {
        currentList = location.state.sceneList.map(String);
        setNavIds(currentList);
        useNavQueueStore.getState().setQueue(currentList);
      } else if (currentList.length === 0 || !currentList.includes(String(id))) {
        try {
          const raw = sessionStorage.getItem("pfx-nav-scenes");
          let parsed = [];
          if (raw) {
            try { parsed = JSON.parse(raw) || []; } catch {}
          }
          if (parsed.length > 0 && parsed.includes(String(id))) {
            currentList = parsed.map(String);
            setNavIds(currentList);
            useNavQueueStore.getState().setQueue(currentList);
          } else {
            const sortVal = localStorage.getItem("pfx-library-sort") || "recent";
            const res = await api.scenes({ limit: 120, sort: sortVal }).catch(() => ({ scenes: [] }));
            let list = (res.scenes || []).map((s) => String(s._id));
            if (!list.includes(String(id))) {
              list = [String(id), ...list];
            }
            currentList = list;
            setNavIds(list);
            useNavQueueStore.getState().setQueue(list);
          }
        } catch (err) {
          console.error("Failed to load nav queue", err);
        }
      }
    })();
  }, [id, location.state]);

  useEffect(() => {
    setSeekTarget(null);
    setLoading(true);
    (async () => {
      try {
        const [res, fav, pl, simRes] = await Promise.all([
          api.scene(id),
          api.favorites().catch(() => []),
          api.playlists().catch(() => []),
          api.similarScenes(id, 6).catch(() => ({ similar: [], scenes: [] })),
        ]);
        setScene(res.scene);
        setPerformers(res.performers || []);
        setStudio(res.studio || null);
        setCategories(res.categories || []);
        setTimestamps(res.timestamps || []);
        setComments(res.comments || []);
        setStatus(res.tracking ? res.tracking.status : "");
        setResumeFrom(res.tracking ? res.tracking.currentTime || 0 : 0);
        setFavorite(fav.find((f) => f.type === "scene" && String(f.target_id) === String(id)) || null);
        setPlaylists(pl);
        setRecs(simRes?.similar || simRes?.scenes || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (status !== lastStatus.current) {
      lastStatus.current = status;
      if (status === "") return;
      api.setTracking(parseInt(id, 10), { status, currentTime: 0 }).catch(() => {});
    }
  }, [status, id]);

  const setStatusIdx = (val) => setStatus(val === status ? "" : val);

  const onRandom = async () => {
    try {
      const res = await api.randomScene();
      const s = res.scene || res;
      if (s && s._id) {
        const nextId = String(s._id);
        const updatedList = navIds.includes(nextId) ? navIds : [...navIds, nextId];
        setNavIds(updatedList);
        useNavQueueStore.getState().setQueue(updatedList);
        navigate(ROUTES.scene(nextId), { state: { sceneList: updatedList }, replace: true });
      }
    } catch (e) {
      console.error("Random scene error", e);
    }
  };

  const onNext = async () => {
    if (!navIds || navIds.length === 0) {
      return onRandom();
    }
    const curIdx = navIds.findIndex((x) => String(x) === String(id));
    if (curIdx >= 0) {
      const nextIdx = (curIdx + 1) % navIds.length;
      navigate(ROUTES.scene(navIds[nextIdx]), { state: { sceneList: navIds }, replace: true });
    } else {
      navigate(ROUTES.scene(navIds[0]), { state: { sceneList: navIds }, replace: true });
    }
  };

  const onPrev = async () => {
    if (!navIds || navIds.length === 0) {
      return onRandom();
    }
    const curIdx = navIds.findIndex((x) => String(x) === String(id));
    if (curIdx >= 0) {
      const prevIdx = (curIdx - 1 + navIds.length) % navIds.length;
      navigate(ROUTES.scene(navIds[prevIdx]), { state: { sceneList: navIds }, replace: true });
    } else {
      navigate(ROUTES.scene(navIds[navIds.length - 1]), { state: { sceneList: navIds }, replace: true });
    }
  };

  const handleBack = () => {
    const prevBrowse = sessionStorage.getItem("pfx-last-browse-path");
    if (prevBrowse && !prevBrowse.startsWith(ROUTES.SCENE.replace("/:id", ""))) {
      navigate(prevBrowse);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(ROUTES.LIBRARY);
    }
  };

  const addComment = async (text, performerIds = []) => {
    if (!text || !text.trim()) return;
    const c = await api.addComment(parseInt(id, 10), text.trim(), performerIds);
    setComments((p) => [c, ...p]);
  };

  const deleteComment = async (commentId) => {
    try {
      await api.deleteComment(commentId);
      setComments((p) => p.filter((x) => x._id !== commentId));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleFavorite = async () => {
    const existing = favorite;
    try {
      if (existing) {
        await api.removeFavorite(existing.type, existing.target_id);
        setFavorite(null);
      } else {
        const title = (scene && (scene.title || scene.file_name)) || String(id);
        const fav = await api.addFavorite("scene", String(id), title);
        setFavorite(fav || { type: "scene", target_id: String(id), target_name: title });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sceneIdNum = parseInt(id, 10);
  const inPlaylist = (pl) =>
    Array.isArray(pl?.scene_ids) && pl.scene_ids.some((s) => String(s) === String(sceneIdNum));

  const togglePlaylist = async (pl) => {
    if (plBusy) return;
    setPlBusy(true);
    try {
      if (inPlaylist(pl)) {
        await api.removeFromPlaylist(pl._id, sceneIdNum);
        setPlaylists((prev) =>
          prev.map((p) =>
            p._id === pl._id
              ? { ...p, scene_ids: (p.scene_ids || []).filter((s) => String(s) !== String(sceneIdNum)) }
              : p
          )
        );
      } else {
        await api.addToPlaylist(pl._id, sceneIdNum);
        setPlaylists((prev) =>
          prev.map((p) =>
            p._id === pl._id ? { ...p, scene_ids: [...(p.scene_ids || []), sceneIdNum] } : p
          )
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPlBusy(false);
    }
  };

  const createAndAddPlaylist = async (name) => {
    if (!name || plBusy) return;
    setPlBusy(true);
    try {
      const pl = await api.createPlaylist(name, "");
      await api.addToPlaylist(pl._id, sceneIdNum);
      setPlaylists((prev) => [{ ...pl, scene_ids: [sceneIdNum] }, ...prev]);
    } catch (e) {
      console.error(e);
    } finally {
      setPlBusy(false);
    }
  };

  const handleAddTimestamp = async (body) => {
    try {
      const t = await api.addTimestamp(body);
      setTimestamps((p) => [...p, t]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateTimestamp = async (tId, body) => {
    try {
      const t = await api.updateTimestamp(tId, body);
      setTimestamps((p) => p.map((x) => (x._id === tId ? { ...x, ...t } : x)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTimestamp = async (tId) => {
    try {
      await api.deleteTimestamp(tId);
      setTimestamps((p) => p.filter((x) => x._id !== tId));
    } catch (e) {
      console.error(e);
    }
  };

  return {
    id,
    scene,
    setScene,
    performers,
    setPerformers,
    studio,
    setStudio,
    categories,
    setCategories,
    timestamps,
    comments,
    status,
    setStatusIdx,
    favorite,
    playlists,
    plBusy,
    panelOpen,
    setPanelOpen,
    editOpen,
    setEditOpen,
    seekTarget,
    setSeekTarget,
    resumeFrom,
    autoResume,
    now,
    setNow,
    loading,
    recs,
    onRandom,
    onNext,
    onPrev,
    handleBack,
    addComment,
    deleteComment,
    toggleFavorite,
    togglePlaylist,
    createAndAddPlaylist,
    handleAddTimestamp,
    handleUpdateTimestamp,
    handleDeleteTimestamp,
  };
}
