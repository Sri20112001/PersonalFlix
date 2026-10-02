import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const API = "http://127.0.0.1:31731";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // In production the window loads the SPA directly from the embedded
  // axum server, so assets must use relative paths.
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": API,
      "/thumbnails": API,
      "/performers": API,
      "/studios": API,
    },
  },
  build: {
    outDir: "dist",
    target: "es2020",
  },
});