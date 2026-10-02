import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/apiClient";
import { ROUTES } from "../constants/routes";

export function useLeanback() {
  const navigate = useNavigate();
  const [continueWatching, setContinueWatching] = useState([]);
  const [recentScenes, setRecentScenes] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  // 10-foot navigation coordinates: row 0, 1, 2
  const [rowIdx, setRowIdx] = useState(0);
  const [colIdx, setColIdx] = useState(0);
  const [timeStr, setTimeStr] = useState("");

  // Clock
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTimeStr(
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, []);

  // Data loading
  useEffect(() => {
    (async () => {
      try {
        const [cw, rec, fav] = await Promise.all([
          api.continueWatching().catch(() => ({ scenes: [] })),
          api.scenes({ limit: 20, sort: "recent" }).catch(() => ({ scenes: [] })),
          api.favorites("scene").catch(() => []),
        ]);
        setContinueWatching(cw.scenes || []);
        setRecentScenes(rec.scenes || []);

        const favIds = (fav || []).map((f) => f.target_id);
        if (favIds.length > 0) {
          const favScenes = await Promise.all(
            favIds.slice(0, 15).map((id) => api.scene(id).catch(() => null))
          );
          setFavorites(favScenes.filter(Boolean).map((x) => x.scene));
        }
      } catch (err) {
        console.error("Leanback load error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = [
    { title: "Continue Watching", items: continueWatching, empty: "No videos in progress" },
    { title: "Recently Added", items: recentScenes, empty: "No recent videos" },
    { title: "Favorites & Highlights", items: favorites, empty: "No favorites added yet" },
  ].filter((r) => r.items.length > 0);

  // Keyboard navigation for TV remote / Arrow keys
  useEffect(() => {
    const onKey = (e) => {
      if (rows.length === 0) return;
      const curRow = rows[rowIdx];
      const curItems = curRow ? curRow.items : [];

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setColIdx((c) => Math.min(c + 1, curItems.length - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setColIdx((c) => Math.max(c - 1, 0));
          break;
        case "ArrowDown":
          e.preventDefault();
          setRowIdx((r) => {
            const nextR = Math.min(r + 1, rows.length - 1);
            setColIdx((c) => Math.min(c, (rows[nextR]?.items.length || 1) - 1));
            return nextR;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setRowIdx((r) => {
            const prevR = Math.max(r - 1, 0);
            setColIdx((c) => Math.min(c, (rows[prevR]?.items.length || 1) - 1));
            return prevR;
          });
          break;
        case "Enter":
          e.preventDefault();
          if (curItems[colIdx]) {
            navigate(ROUTES.scene(curItems[colIdx]._id, { resume: "true" }), { replace: true });
          }
          break;
        case "Escape":
        case "Backspace":
          e.preventDefault();
          navigate(ROUTES.HOME);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, rowIdx, colIdx, navigate]);

  const activeScene = rows[rowIdx]?.items[colIdx];

  return {
    rows,
    rowIdx,
    colIdx,
    setRowIdx,
    setColIdx,
    timeStr,
    loading,
    activeScene,
    navigate,
  };
}
