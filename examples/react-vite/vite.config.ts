import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@yohawing/timeline-editor/styles.css", replacement: `${packageRoot}/dist/timeline.css` },
      { find: "@yohawing/timeline-editor/core", replacement: `${packageRoot}/dist/core.js` },
      { find: "@yohawing/timeline-editor", replacement: `${packageRoot}/dist/index.js` },
    ],
  },
  build: { outDir: `${root}/dist`, emptyOutDir: true },
});
