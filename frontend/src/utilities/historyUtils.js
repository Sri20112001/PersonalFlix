export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function dayKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // days from prev month
  const dim = new Date(year, month + 1, 0).getDate();
  const out = [];
  for (let i = 0; i < lead; i++) {
    const d = new Date(year, month, -lead + i + 1);
    out.push({ key: `p-${i}`, label: d.getDate(), other: true, date: d });
  }
  for (let d = 1; d <= dim; d++) {
    out.push({ key: `c-${d}`, label: d, date: new Date(year, month, d) });
  }
  while (out.length % 7 !== 0) {
    const n = out.length;
    out.push({ key: `n-${n}`, label: "", other: true, date: null });
  }
  return out;
}
