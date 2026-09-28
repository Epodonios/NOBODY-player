import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

// The wizard renderer builds to ONE inlined index.html (vite-plugin-singlefile)
// — same trick the main app uses. No runtime file fetches, no cache traps.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src"), "@shared": path.resolve(__dirname, "shared") },
  },
});
