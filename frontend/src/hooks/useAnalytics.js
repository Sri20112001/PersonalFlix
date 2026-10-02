import { useEffect, useState } from "react";
import { api } from "../api/apiClient";
import { formatTime } from "../utilities/formatters";

export function useAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.analytics().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const wt = data?.watchTime || {};
  // Exact session-log totals take over once the player has logged events;
  // otherwise fall back to the tracking-position approximation.
  const exact = data?.watchTimeExact || {};
  const hasExact = (exact.events || 0) > 0;
  const totalExact = hasExact ? exact.total || 0 : wt.total || data?.secondsWatched || 0;
  const cards = data
    ? [
        ["Watched", data.watched, true],
        ["Watching", data.watching, true],
        ["Want", data.want, true],
        ["Completion", `${data.completionPct}%`, true],
        ["Watch time", formatTime(totalExact), true],
        ["Avg rating", data.avgRating != null ? Number(data.avgRating).toFixed(1) : "—", (data.rated || 0) > 0],
      ]
    : [];

  const watchCards = data
    ? [
        ["Today", formatTime(hasExact ? exact.today || 0 : wt.today || 0)],
        ["Last 7 days", formatTime(hasExact ? exact.last7d || 0 : wt.last7d || 0)],
        ["Last 30 days", formatTime(hasExact ? exact.last30d || 0 : wt.last30d || 0)],
        ["Avg / day", formatTime(wt.avgPerDay30 || 0)],
        ["Avg / scene", formatTime(wt.avgPerScene || 0)],
        ["Remaining", formatTime(wt.remaining || 0)],
      ]
    : [];

  return {
    data,
    loading,
    cards,
    watchTime: wt,
    watchTimeExact: exact,
    hasExact,
    watchCards,
    daily: data?.daily || [],
    heatmap: data?.heatmap || [],
    completion: data?.completion || null,
    topScenes: data?.topScenes || [],
    ratingBuckets: data?.ratingBuckets || [],
  };
}
