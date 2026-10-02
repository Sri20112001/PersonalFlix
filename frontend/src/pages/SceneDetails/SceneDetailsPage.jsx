import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/apiClient";
import { STATUS_OPTS } from "../../constants/status";
import Spinner from "../../ui/Spinner";
import { CloseIcon } from "../../utilities/icons";
import EditSceneDialog from "../../components/EditSceneDialog";

import SceneHeader from "./SceneHeader";
import SceneMetadata from "./SceneMetadata";
import ChapterTimeline from "./ChapterTimeline";
import SimilarScenesRail from "./SimilarScenesRail";
import { ROUTES } from "../../constants/routes";

export default function SceneDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [scene, setScene] = useState(null);
  const [performers, setPerformers] = useState([]);
  const [studio, setStudio] = useState(null);
  const [categories, setCategories] = useState([]);
  const [timestamps, setTimestamps] = useState([]);
  const [comments, setComments] = useState([]);
  const [tracking, setTracking] = useState(null);
  const [favorite, setFavorite] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [plBusy, setPlBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [revealSuccess, setRevealSuccess] = useState(false);

  const fetchSceneData = async () => {
    setLoading(true);
    try {
      const [res, fav, pl, simRes] = await Promise.all([
        api.scene(id),
        api.favorites().catch(() => []),
        api.playlists().catch(() => []),
        api.similarScenes(id, 8).catch(() => ({ similar: [], scenes: [] })),
      ]);
      setScene(res.scene);
      setPerformers(res.performers || []);
      setStudio(res.studio || null);
      setCategories(res.categories || []);
      setTimestamps(res.timestamps || []);
      setComments(res.comments || []);
      setTracking(res.tracking || null);
      setStatus(res.tracking ? res.tracking.status : "");
      setFavorite(
        fav.find((f) => f.type === "scene" && String(f.target_id) === String(id)) || null
      );
      setPlaylists(pl);
      setRecs(simRes?.similar || simRes?.scenes || []);
    } catch (e) {
      console.error("Failed to load scene details", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSceneData();
  }, [id]);

  const sceneIdNum = parseInt(id, 10);

  const handleToggleFavorite = async () => {
    if (favorite) {
      try {
        await api.removeFavorite("scene", sceneIdNum);
        setFavorite(null);
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        const fav = await api.addFavorite("scene", sceneIdNum, scene?.title || `Scene ${id}`);
        setFavorite(fav);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleStatusSelect = async (newStatus) => {
    setStatus(newStatus);
    setStatusMenuOpen(false);
    try {
      const cur = tracking?.currentTime || 0;
      const t = await api.setTracking(sceneIdNum, {
        status: newStatus,
        currentTime: cur,
      });
      setTracking(t);
    } catch (err) {
      console.error(err);
    }
  };

  const inPlaylist = (pl) => {
    return (pl.scenes || []).some((sid) => String(sid) === String(id));
  };

  const togglePlaylist = async (pl) => {
    const active = inPlaylist(pl);
    try {
      if (active) {
        await api.removeFromPlaylist(pl._id, sceneIdNum);
      } else {
        await api.addToPlaylist(pl._id, sceneIdNum);
      }
      const updated = await api.playlists();
      setPlaylists(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim() || plBusy) return;
    setPlBusy(true);
    try {
      const pl = await api.createPlaylist(newPlaylistName.trim());
      await api.addToPlaylist(pl._id, sceneIdNum);
      setNewPlaylistName("");
      const updated = await api.playlists();
      setPlaylists(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setPlBusy(false);
    }
  };

  const handleAddComment = async (e) => {
    e?.preventDefault();
    if (!commentText.trim() || commentBusy) return;
    setCommentBusy(true);
    try {
      const c = await api.addComment(sceneIdNum, commentText.trim());
      setComments((prev) => [c, ...prev]);
      setCommentText("");
    } catch (err) {
      console.error(err);
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await api.deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c._id !== commentId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyPath = () => {
    if (!scene?.file_path) return;
    navigator.clipboard.writeText(scene.file_path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2500);
  };

  const handleRevealInExplorer = async () => {
    if (!scene?.file_path) return;
    try {
      await api.libraryReveal({ path: scene.file_path });
      setRevealSuccess(true);
      setTimeout(() => setRevealSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlayFromTimestamp = (seconds) => {
    navigate(ROUTES.scene(id, { t: Math.floor(seconds) }), {
      state: { seekTarget: seconds, autoResume: false },
      replace: true,
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#070708]">
        <Spinner />
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-[#070708] text-white">
        <h2 className="text-xl font-bold">Scene Not Found</h2>
        <button
          onClick={() => navigate(ROUTES.LIBRARY)}
          className="px-5 py-2.5 rounded-xl bg-accent text-zinc-950 font-bold text-xs uppercase tracking-wider cursor-pointer"
        >
          Go to Library
        </button>
      </div>
    );
  }

  const durationSec = tracking?.duration || scene.duration || 0;
  const currentSec = tracking?.currentTime || 0;
  const hasProgress = currentSec > 5;
  const progressPercent = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const currentStatusObj = STATUS_OPTS.find((s) => s.key === status) || STATUS_OPTS[0];

  return (
    <div className="h-full overflow-y-auto bg-[#070708] text-zinc-200 select-text pb-24 custom-scrollbar">
      <SceneHeader
        scene={scene}
        id={id}
        studio={studio}
        categories={categories}
        tracking={tracking}
        status={status}
        statusMenuOpen={statusMenuOpen}
        setStatusMenuOpen={setStatusMenuOpen}
        onStatusSelect={handleStatusSelect}
        statusOpts={STATUS_OPTS}
        currentStatusObj={currentStatusObj}
        durationSec={durationSec}
        currentSec={currentSec}
        hasProgress={hasProgress}
        progressPercent={progressPercent}
        favorite={favorite}
        onToggleFavorite={handleToggleFavorite}
        playlists={playlists}
        playlistMenuOpen={playlistMenuOpen}
        setPlaylistMenuOpen={setPlaylistMenuOpen}
        inPlaylist={inPlaylist}
        onTogglePlaylist={togglePlaylist}
        newPlaylistName={newPlaylistName}
        setNewPlaylistName={setNewPlaylistName}
        onCreatePlaylist={handleCreatePlaylist}
        plBusy={plBusy}
        onOpenEdit={() => setEditOpen(true)}
        copiedPath={copiedPath}
        onCopyPath={handleCopyPath}
        revealSuccess={revealSuccess}
        onRevealInExplorer={handleRevealInExplorer}
        onBack={() => navigate(-1)}
        onPlay={() =>
          navigate(ROUTES.scene(id, hasProgress ? { resume: true } : undefined), {
            state: hasProgress ? { autoResume: true } : undefined,
            replace: true,
          })
        }
      />

      <div className="px-6 sm:px-12 max-w-7xl mx-auto flex flex-col gap-10 mt-8">
        <SceneMetadata
          performers={performers}
          scene={scene}
          durationSec={durationSec}
          onCopyPath={handleCopyPath}
          copiedPath={copiedPath}
        />

        <ChapterTimeline
          timestamps={timestamps}
          onPlayFromTimestamp={handlePlayFromTimestamp}
        />

        {/* Notes & Comments Feed */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-mono">
            Personal Notes ({comments.length})
          </h2>

          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              placeholder="Add personal note..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-accent/80 font-mono"
            />
            <button
              type="submit"
              disabled={!commentText.trim() || commentBusy}
              className="px-5 py-2 rounded-xl bg-accent text-zinc-950 font-bold text-xs uppercase tracking-wider disabled:opacity-30 cursor-pointer active:scale-95"
            >
              Post
            </button>
          </form>

          {comments.length > 0 && (
            <div className="flex flex-col gap-2">
              {comments.map((c) => (
                <div
                  key={c._id}
                  className="flex items-start justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-white/10 text-xs"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">{c.comment}</p>
                    {c.created_at && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteComment(c._id)}
                    className="text-zinc-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                    title="Delete Note"
                  >
                    <CloseIcon size={13} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <SimilarScenesRail recs={recs} />
      </div>

      {/* Edit Modal Dialog */}
      {editOpen && (
        <EditSceneDialog
          open={editOpen}
          sceneId={sceneIdNum}
          scene={scene}
          performers={performers}
          studio={studio}
          categories={categories}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            fetchSceneData();
          }}
        />
      )}
    </div>
  );
}
