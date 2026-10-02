import React from "react";
import ScenePlayer from "../../components/ScenePlayer";
import SceneInfoPanel from "../../components/SceneInfoPanel";
import SceneMetadataEditor from "../../components/SceneMetadataEditor";
import Spinner from "../../components/Spinner";
import { ExternalTabIcon, InfoIcon } from "../../utilities/icons";
import { useScenePlayback } from "../../hooks/useScenePlayback";
import { ROUTES } from "../../constants/routes";

export default function ScenePage() {
  const {
    id,
    scene,
    setScene,
    performers,
    setPerformers,
    studio,
    setStudio,
    categories,
    setCategories,
    timestamps,
    comments,
    status,
    setStatusIdx,
    favorite,
    playlists,
    plBusy,
    panelOpen,
    setPanelOpen,
    editOpen,
    setEditOpen,
    seekTarget,
    setSeekTarget,
    resumeFrom,
    autoResume,
    now,
    setNow,
    loading,
    recs,
    onRandom,
    onNext,
    onPrev,
    handleBack,
    addComment,
    deleteComment,
    toggleFavorite,
    togglePlaylist,
    createAndAddPlaylist,
    handleAddTimestamp,
    handleUpdateTimestamp,
    handleDeleteTimestamp,
  } = useScenePlayback();

  if (loading || !scene) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-black overflow-hidden relative">
      {/* Player Section */}
      <div
        className={`h-full min-w-0 transition-all duration-200 relative ${
          panelOpen || editOpen ? "flex-1" : "flex-1 w-full"
        }`}
      >
        <ScenePlayer
          sceneId={parseInt(id, 10)}
          timestamps={timestamps}
          recs={recs}
          onNext={onNext}
          onPrev={onPrev}
          onRandom={onRandom}
          onStatusKey={setStatusIdx}
          onInfo={(forceOpen) =>
            setPanelOpen((v) => (typeof forceOpen === "boolean" ? forceOpen : !v))
          }
          seekRequest={seekTarget}
          initialTime={resumeFrom}
          autoResume={autoResume}
          onProgress={setNow}
          onBack={handleBack}
        />

        {/* Floating Action Buttons when side panel is collapsed */}
        {!panelOpen && !editOpen && (
          <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("pfx-open-tab", {
                    detail: {
                      path: ROUTES.sceneDetails(id),
                      title: `${(scene && (scene.title || scene.file_name)) || "Scene"} - Details`,
                    },
                  })
                );
              }}
              className="bg-black/70 hover:bg-black/90 hover:border-accent/50 border border-white/20 text-white/80 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 backdrop-blur transition-all shadow-xl cursor-pointer group"
              title="Open Dedicated Scene Details in a New Tab"
            >
              <ExternalTabIcon size={14} className="group-hover:text-accent transition-colors" />
              <span>Details (Tab)</span>
            </button>

            <button
              onClick={() => setPanelOpen(true)}
              className="bg-black/70 hover:bg-black/90 border border-white/20 text-white/80 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 backdrop-blur transition-all shadow-xl cursor-pointer"
              title="Open Info Panel (I)"
            >
              <InfoIcon size={14} />
              <span>Info</span>
            </button>
          </div>
        )}
      </div>

      {/* Unified Scene Info Panel / Inline Metadata Editor */}
      {(panelOpen || editOpen) && (
        <div className="w-[420px] max-w-[45%] flex-shrink-0 h-full min-w-[360px]">
          {editOpen ? (
            <SceneMetadataEditor
              key={id}
              sceneId={parseInt(id, 10)}
              scene={scene}
              performers={performers}
              studio={studio}
              categories={categories}
              onCancel={() => setEditOpen(false)}
              onSaved={(res) => {
                setScene(res.scene);
                setPerformers(res.performers || []);
                setStudio(res.studio || null);
                setCategories(res.categories || []);
                setEditOpen(false);
              }}
            />
          ) : (
            <SceneInfoPanel
              scene={scene}
              performers={performers}
              studio={studio}
              timestamps={timestamps}
              comments={comments}
              status={status}
              onStatusChange={setStatusIdx}
              favorite={favorite}
              onToggleFavorite={toggleFavorite}
              playlists={playlists}
              onTogglePlaylist={togglePlaylist}
              onCreatePlaylist={createAndAddPlaylist}
              plBusy={plBusy}
              onEditScene={() => setEditOpen(true)}
              onBack={handleBack}
              onClosePanel={() => setPanelOpen(false)}
              onSeek={setSeekTarget}
              currentTime={now}
              onAddTimestamp={handleAddTimestamp}
              onUpdateTimestamp={handleUpdateTimestamp}
              onDeleteTimestamp={handleDeleteTimestamp}
              onAddComment={addComment}
              onDeleteComment={deleteComment}
            />
          )}
        </div>
      )}
    </div>
  );
}
