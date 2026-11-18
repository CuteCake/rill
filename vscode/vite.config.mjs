import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  publicDir: false,
  build: {
    outDir: "vscode/media",
    lib: { entry: "vscode/viewer.jsx", name: "Rill", formats: ["iife"], fileName: () => "viewer.js" },
  },
});
