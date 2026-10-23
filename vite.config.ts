import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // Prebundle the lazy editor up front so its first use cannot reload the page
  // when Vite discovers a new language/highlighting dependency in development.
  optimizeDeps: {
    include: [
      "codemirror",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/lang-css",
      "@codemirror/lang-html",
      "@codemirror/lang-javascript",
      "@codemirror/lang-json",
      "@codemirror/lang-markdown",
      "@codemirror/lang-python",
      "@lezer/highlight",
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 800 },
});
