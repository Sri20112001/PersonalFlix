import React from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../../components/Spinner";
import { useCategories } from "../../hooks/useCategories";
import { ROUTES } from "../../constants/routes";

const CAT_COLORS = ["#F5B301", "#6366F1", "#14B8A6", "#F59E0B", "#8B5CF6", "#0EA5E9", "#22C55E", "#F43F5E"];

export default function CategoriesPage() {
  const { list, loading } = useCategories();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col bg-background pt-6 pb-12 px-10">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <h1 className="font-display uppercase tracking-widest text-2xl">Categories</h1>
        <span className="text-xs text-textMuted uppercase tracking-widest">{list.length} categories</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {loading ? (
          <Spinner />
        ) : (
          <div className="flex flex-wrap gap-3">
            {list.map((c, i) => (
              <button
                key={c._id}
                onClick={() => navigate(ROUTES.category(c._id))}
                className="group px-5 py-2.5 rounded font-bold uppercase tracking-widest text-sm text-white transition-all hover:scale-105 cursor-pointer"
                style={{ background: CAT_COLORS[i % CAT_COLORS.length], opacity: 0.85 }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
