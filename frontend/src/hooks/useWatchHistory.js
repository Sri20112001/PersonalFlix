import { useEffect, useMemo, useState } from "react";
import { api } from "../api/apiClient";
import { dayKey, buildMonthCells } from "../utilities/historyUtils";

export function useWatchHistory() {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.watchHistory()
      .then((res) => {
        setDays(res.days || []);
        if ((res.days || []).length > 0) setSelected((s) => s || res.days[0].day);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const byDay = useMemo(() => {
    const m = {};
    days.forEach((d) => { m[d.day] = d; });
    return m;
  }, [days]);

  const monthTotal = useMemo(
    () => days.filter((d) => d.day.startsWith(dayKey(year, month, 1).slice(0, 7)))
      .reduce((a, d) => a + (d.count || 0), 0),
    [days, year, month]
  );

  const monthSeconds = useMemo(
    () => days.filter((d) => d.day.startsWith(dayKey(year, month, 1).slice(0, 7)))
      .reduce((a, d) => a + (d.seconds || 0), 0),
    [days, year, month]
  );

  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const resetToCurrentMonth = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const sel = selected ? byDay[selected] : null;
  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return {
    days,
    loading,
    byDay,
    monthTotal,
    monthSeconds,
    cells,
    selected,
    setSelected,
    sel,
    monthName,
    shiftMonth,
    resetToCurrentMonth,
  };
}
