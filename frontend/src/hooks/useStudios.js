import { useState, useEffect } from "react";
import { api } from "../api/apiClient";

export function useStudios() {
  const [list, setList] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [studios, stats] = await Promise.all([
          api.studios(),
          api.libraryStats().catch(() => null),
        ]);
        setList(studios);
        const map = {};
        (stats?.studios || []).forEach((r) => {
          if (r.studioId) map[String(r.studioId)] = r;
        });
        setCounts(map);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return {
    list,
    counts,
    loading,
  };
}
