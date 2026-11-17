import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: import.meta.dirname,
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
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, "index.html"),
        mascot: resolve(import.meta.dirname, "mascot.html"),
      },
    },
  },
});
