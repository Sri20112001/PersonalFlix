import { useEffect, useState, useCallback } from "react";
import { api } from "../api/apiClient";

export const PRESETS = [
  { name: "Continue Watching", query: "status:watching" },
  { name: "Unwatched", query: "status:unwatched" },
  { name: "Highly Rated", query: "rating:>=4" },
  { name: "Long sessions", query: "duration:>30m" },
];

export function useCollections() {
  const [collections, setCollections] = useState([]);
  const [active, setActive] = useState(null);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    return api.collections().then(setCollections).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (col) => {
    setActive(col);
    setRunning(true);
    try {
      const res = await api.search(col.query, 1, 30);
      setResults(res.scenes || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  const remove = async (col) => {
    await api.deleteCollection(col._id);
    if (active?._id === col._id) {
      setActive(null);
      setResults([]);
    }
    load();
  };

  const addPreset = async (p) => {
    if (collections.some((c) => c.name === p.name && c.query === p.query)) return;
    await api.createCollection(p.name, p.query);
    load();
  };

  return {
    collections,
    active,
    results,
    total,
    loading,
    running,
    run,
    remove,
    addPreset,
  };
}
