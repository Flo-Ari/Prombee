import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: "frontend",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // The editing controller reloads only after pending saves finish. Avoid React
    // Fast Refresh reconciling contenteditable selections or native DOM adapters.
    hmr: false,
    proxy: { "/api": { target: "http://127.0.0.1:8765", changeOrigin: false } },
  },
  build: {
    outDir: "../web",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        editor: resolve("frontend/index.html"),
        mascot: resolve("frontend/mascot.html"),
      },
    },
  },
});
