import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* PHASE-4 PERF FIX: viteSingleFile is now OPT-IN (SINGLEFILE=1 bun run build)
   for the Electron fallback package. The default build ships plain dist/ files
   that Tauri serves through its asset protocol — no more ~900KB HTML blob to
   parse+compile in one go at every startup, and code-splitting/caching work
   again. `base: "./"` keeps relative URLs valid for both Tauri (served from
   the app origin root) and Electron's file:// loading. */
const singleFile = process.env.SINGLEFILE === "1";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // Rust target files are frequently locked by Cargo on Windows. Keeping
      // them outside Vite's watcher avoids EBUSY crashes in `tauri dev`.
      ignored: ["**/src-tauri/**", "**/target/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
