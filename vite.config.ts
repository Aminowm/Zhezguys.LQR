import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH lets the same build work on GitHub Pages (/Zhezguys.LQR/) or at a domain root.
export default defineConfig({
  base: process.env.BASE_PATH ?? "./",
  plugins: [react()],
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as any);
