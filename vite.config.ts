import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the game works at any sub path (e.g. GitHub Pages).
  base: "./",
  test: {
    environment: "node",
  },
});
