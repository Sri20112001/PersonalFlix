const replaceId = (pattern, id, params) => {
  let url = pattern.replace(":id", encodeURIComponent(id));
  if (params) {
    const q = new URLSearchParams(params).toString();
    if (q) url += `?${q}`;
  }
  return url;
};

export const ROUTES = {
  HOME: "/",
  LIBRARY: "/library",
  SCENE: "/scene/:id",
  SCENE_DETAILS: "/scene/:id/details",
  PERFORMERS: "/performers",
  PERFORMER: "/performer/:id",
  STUDIOS: "/studios",
  STUDIO: "/studio/:id",
  CATEGORIES: "/categories",
  CATEGORY: "/category/:id",
  FAVORITES: "/favorites",
  PLAYLISTS: "/playlists",
  PLAYLIST: "/playlist/:id",
  SETTINGS: "/settings",
  HEALTH: "/health",
  REVIEW: "/review",
  MULTIVIEW: "/multiview",
  HISTORY: "/history",
  COLLECTIONS: "/collections",
  ANALYTICS: "/analytics",
  LEANBACK: "/leanback",
  GRAPH: "/graph",
  NOT_FOUND: "*",

  // Dynamic route builders
  scene: (id, params) => replaceId(ROUTES.SCENE, id, params),
  sceneDetails: (id) => replaceId(ROUTES.SCENE_DETAILS, id),
  performer: (id) => replaceId(ROUTES.PERFORMER, id),
  studio: (id) => replaceId(ROUTES.STUDIO, id),
  category: (id) => replaceId(ROUTES.CATEGORY, id),
  playlist: (id) => replaceId(ROUTES.PLAYLIST, id),
};
