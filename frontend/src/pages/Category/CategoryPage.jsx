import React from "react";
import { useParams } from "react-router-dom";
import VideoCard from "../../components/VideoCard";
import Spinner from "../../components/Spinner";
import { useCategoryScenes } from "../../hooks/useCategoryScenes";

export default function CategoryPage() {
  const { id } = useParams();
  const { category, scenes, loading } = useCategoryScenes(id);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background pt-6 pb-12 px-10">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <h1 className="font-display uppercase tracking-widest text-3xl">
          {category ? category.name : "Category"}
        </h1>
        <span className="text-xs text-textMuted uppercase tracking-widest">{scenes.length} scenes</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {scenes.length === 0 ? (
          <div className="text-textMuted text-sm">No scenes in this category.</div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {scenes.map((s) => (
              <VideoCard key={s._id} scene={s} width="100%" height={150} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
