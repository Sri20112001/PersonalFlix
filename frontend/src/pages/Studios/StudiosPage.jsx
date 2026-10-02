import React from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../../components/Spinner";
import StatCard from "../../components/StatCard";
import { useStudios } from "../../hooks/useStudios";
import { ROUTES } from "../../constants/routes";

export default function StudiosPage() {
  const { list, counts, loading } = useStudios();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col bg-background pt-6 pb-12 px-10">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <h1 className="font-display uppercase tracking-widest text-2xl">Studios</h1>
        <span className="text-xs text-textMuted uppercase tracking-widest">{list.length} studios</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {loading ? (
          <Spinner />
        ) : (
          <div className="grid gap-4 pb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {list.map((s) => {
              const c = counts[String(s._id)] || {};
              const scenes = c.scenes ?? "—";
              const missing = c.missing ?? 0;
              const available = typeof c.scenes === "number" ? c.scenes - missing : "—";
              return (
                <StatCard
                  key={s._id}
                  title={s.name}
                  initial={s.name}
                  image={s.logo || null}
                  onOpen={() => navigate(ROUTES.studio(s._id))}
                  stats={[
                    { value: scenes, label: "Scenes" },
                    { value: available, label: "Available" },
                    { value: missing, label: "Missing", alert: missing > 0 },
                  ]}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
