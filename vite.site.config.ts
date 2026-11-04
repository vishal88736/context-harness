import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { renameSync } from "node:fs";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "site-index",
      closeBundle() {
        renameSync("dist-site/site.html", "dist-site/index.html");
      },
    },
  ],
  base: process.env.CANOPY_SITE_BASE ?? "/",
  build: {
    outDir: "dist-site",
    sourcemap: false,
    rollupOptions: { input: "site.html" },
  },
});
