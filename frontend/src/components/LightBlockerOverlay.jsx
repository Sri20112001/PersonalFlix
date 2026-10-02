import React, { useEffect, useState } from "react";

export default function LightBlockerOverlay() {
  // Saved level: 0 = off, 0.2 to 0.7 = light blocking strength
  const [opacity, setOpacity] = useState(() => {
    return parseFloat(localStorage.getItem("pfx-light-blocker") || "0");
  });
  const [warmMode, setWarmMode] = useState(() => {
    return localStorage.getItem("pfx-light-shield-warm") === "true";
  });

  useEffect(() => {
    localStorage.setItem("pfx-light-blocker", String(opacity));
  }, [opacity]);

  useEffect(() => {
    localStorage.setItem("pfx-light-shield-warm", String(warmMode));
  }, [warmMode]);

  // Global toggle listener: press Alt + D to toggle 35% dimming
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.code === "KeyD") {
        e.preventDefault();
        setOpacity((prev) => (prev > 0 ? 0 : 0.38));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (opacity <= 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[9999] transition-all duration-300 select-none"
      style={{
        backgroundColor: warmMode
          ? `rgba(25, 12, 0, ${opacity})`
          : `rgba(0, 0, 0, ${opacity})`,
        backdropFilter: `brightness(${Math.max(
          0.6,
          1 - opacity * 0.5
        )}) contrast(105%) ${warmMode ? "sepia(15%)" : ""}`,
        mixBlendMode: "multiply",
      }}
    />
  );
}