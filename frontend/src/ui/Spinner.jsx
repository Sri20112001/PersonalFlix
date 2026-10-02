import React from "react";

export default function Spinner({ size = 32, className = "" }) {
  return (
    <div className={`flex items-center justify-center w-full py-10 ${className}`}>
      <div
        className="animate-spin rounded-full border-2 border-accent border-t-transparent"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
