export const BRAND_COLORS = {
  accent: "#E5A919",
  accentHover: "#FFC52F",
  background: "#0A0A0B",
  surface: "#161618",
  surfaceHover: "#222226",
};

export const CHAPTER_COLORS = [
  "#E50914",
  "#6366F1",
  "#14B8A6",
  "#F59E0B",
  "#8B5CF6",
  "#0EA5E9",
  "#22C55E",
  "#F43F5E",
];

export const chapterColor = (cat, i) => {
  const map = {
    intro: "#0EA5E9",
    main: "#E50914",
    orgasm: "#8B5CF6",
    solo: "#14B8A6",
    anal: "#F59E0B",
    oral: "#22C55E",
    ending: "#F43F5E",
    extra: "#64748B",
  };
  if (cat && map[cat]) return map[cat];
  return CHAPTER_COLORS[i % CHAPTER_COLORS.length];
};

export const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg,#141415 0%,#33270a 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#1a1440 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#0f2b2a 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#3a2807 55%,#0a0a0b 100%)",
  "linear-gradient(135deg,#141415 0%,#2a0f35 55%,#0a0a0b 100%)",
];
