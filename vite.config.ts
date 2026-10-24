import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
