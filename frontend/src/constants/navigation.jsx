import React from "react";
import {
  HomeNavIcon,
  LibraryNavIcon,
  PerformersNavIcon,
  StudiosNavIcon,
  GraphNavIcon,
  FavoritesNavIcon,
  ReviewNavIcon,
  MultiviewNavIcon,
  LeanbackNavIcon,
} from "../utilities/icons";
import { ROUTES } from "./routes";

export const NAV_ITEMS = [
  {
    to: ROUTES.HOME,
    label: "Home",
    icon: HomeNavIcon,
  },
  {
    to: ROUTES.LIBRARY,
    label: "Library",
    icon: LibraryNavIcon,
  },
  {
    to: ROUTES.PERFORMERS,
    label: "Performers",
    icon: PerformersNavIcon,
  },
  {
    to: ROUTES.STUDIOS,
    label: "Studios",
    icon: StudiosNavIcon,
  },
  {
    to: ROUTES.GRAPH,
    label: "Graph",
    icon: GraphNavIcon,
  },
  {
    to: ROUTES.FAVORITES,
    label: "Favorites",
    icon: FavoritesNavIcon,
  },
  {
    to: ROUTES.REVIEW,
    label: "Review",
    icon: ReviewNavIcon,
  },
  {
    to: ROUTES.MULTIVIEW,
    label: "Multiview",
    icon: MultiviewNavIcon,
  },
  {
    to: ROUTES.LEANBACK,
    label: "Couch TV",
    icon: LeanbackNavIcon,
  },
];

export function getTitleForPath(pathname) {
  if (pathname === ROUTES.HOME) return "Home";
  if (pathname === ROUTES.LIBRARY) return "Library";
  if (pathname.includes("/details")) return "Scene Details";
  if (pathname.startsWith(ROUTES.SCENE.replace("/:id", ""))) return "Playing Scene";
  if (pathname === ROUTES.PERFORMERS) return "Performers";
  if (pathname.startsWith(ROUTES.PERFORMER.replace("/:id", ""))) return "Performer";
  if (pathname === ROUTES.STUDIOS) return "Studios";
  if (pathname.startsWith(ROUTES.STUDIO.replace("/:id", ""))) return "Studio";
  if (pathname === ROUTES.CATEGORIES) return "Categories";
  if (pathname.startsWith(ROUTES.CATEGORY.replace("/:id", ""))) return "Category";
  if (pathname === ROUTES.FAVORITES) return "Favorites";
  if (pathname === ROUTES.PLAYLISTS) return "Playlists";
  if (pathname.startsWith(ROUTES.PLAYLIST.replace("/:id", ""))) return "Playlist";
  if (pathname === ROUTES.SETTINGS) return "Settings";
  if (pathname === ROUTES.HEALTH) return "Health";
  if (pathname === ROUTES.REVIEW) return "Review";
  if (pathname === ROUTES.MULTIVIEW) return "Multiview";
  if (pathname === ROUTES.HISTORY) return "History";
  if (pathname === ROUTES.COLLECTIONS) return "Collections";
  if (pathname === ROUTES.ANALYTICS) return "Analytics";
  if (pathname === ROUTES.GRAPH) return "Graph Map";
  return "PersonalFlix";
}
