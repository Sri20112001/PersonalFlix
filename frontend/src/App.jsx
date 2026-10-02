import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Shell from "./layout/Shell";

import HomePage from "./pages/Home/HomePage";
import LibraryPage from "./pages/Library/LibraryPage";
import ScenePage from "./pages/Scene/ScenePage";
import SceneDetailsPage from "./pages/SceneDetails/SceneDetailsPage";
import PerformersPage from "./pages/Performers/PerformersPage";
import PerformerPage from "./pages/Performer/PerformerPage";
import StudiosPage from "./pages/Studios/StudiosPage";
import StudioPage from "./pages/Studio/StudioPage";
import CategoriesPage from "./pages/Categories/CategoriesPage";
import CategoryPage from "./pages/Category/CategoryPage";
import FavoritesPage from "./pages/Favorites/FavoritesPage";
import PlaylistsPage from "./pages/Playlists/PlaylistsPage";
import PlaylistPage from "./pages/Playlist/PlaylistPage";
import SettingsPage from "./pages/Settings/SettingsPage";
import HealthPage from "./pages/Health/HealthPage";
import ReviewPage from "./pages/Review/ReviewPage";
import MultiviewPage from "./pages/Multiview/MultiviewPage";
import HistoryPage from "./pages/History/HistoryPage";
import CollectionsPage from "./pages/Collections/CollectionsPage";
import AnalyticsPage from "./pages/Analytics/AnalyticsPage";
import LeanbackPage from "./pages/Leanback/LeanbackPage";
import GraphMapPage from "./pages/GraphMap/GraphMapPage";
import { ROUTES } from "./constants/routes";

export default function App() {
  return (
    
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Shell>
        <Routes>
          <Route path={ROUTES.HOME} element={<HomePage />} />
          <Route path={ROUTES.LIBRARY} element={<LibraryPage />} />
          <Route path={ROUTES.SCENE} element={<ScenePage />} />
          <Route path={ROUTES.SCENE_DETAILS} element={<SceneDetailsPage />} />
          <Route path={ROUTES.PERFORMERS} element={<PerformersPage />} />
          <Route path={ROUTES.PERFORMER} element={<PerformerPage />} />
          <Route path={ROUTES.STUDIOS} element={<StudiosPage />} />
          <Route path={ROUTES.STUDIO} element={<StudioPage />} />
          <Route path={ROUTES.CATEGORIES} element={<CategoriesPage />} />
          <Route path={ROUTES.CATEGORY} element={<CategoryPage />} />
          <Route path={ROUTES.FAVORITES} element={<FavoritesPage />} />
          <Route path={ROUTES.PLAYLISTS} element={<PlaylistsPage />} />
          <Route path={ROUTES.PLAYLIST} element={<PlaylistPage />} />
          <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
          <Route path={ROUTES.HEALTH} element={<HealthPage />} />
          <Route path={ROUTES.REVIEW} element={<ReviewPage />} />
          <Route path={ROUTES.MULTIVIEW} element={<MultiviewPage />} />
          <Route path={ROUTES.HISTORY} element={<HistoryPage />} />
          <Route path={ROUTES.COLLECTIONS} element={<CollectionsPage />} />
          <Route path={ROUTES.ANALYTICS} element={<AnalyticsPage />} />
          <Route path={ROUTES.LEANBACK} element={<LeanbackPage />} />
          <Route path={ROUTES.GRAPH} element={<GraphMapPage />} />
          <Route path={ROUTES.NOT_FOUND} element={<HomePage />} />
        </Routes>
      </Shell>
    </HashRouter>
  );
}
