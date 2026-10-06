import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** All files below a folder, as paths relative to it (with forward slashes). */
function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path).map((p) => `${name}/${p}`) : [name];
  });
}

/**
 * Writes sw.js (from src/service-worker.js) with the list of every file in the build, so the
 * whole game, all word lengths included, can be stored for offline play. The version is a
 * hash of the file names, which contain content hashes: any change gives a new cache.
 */
function serviceWorker(): Plugin {
  return {
    name: "word-weaver-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const publicFiles = listFiles("public").filter((f) => !f.endsWith("preview.jpg") && !f.endsWith(".txt"));
      const files = ["./", ...Object.keys(bundle).filter((f) => f !== "index.html"), ...publicFiles].sort();
      const version = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      const fontCss = readFileSync("index.html", "utf8").match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/)?.[1] ?? "";
      const source = readFileSync("src/service-worker.js", "utf8")
        .replace('"__VERSION__"', JSON.stringify(version))
        .replace("__FILES__", JSON.stringify(files, null, 2))
        .replace('"__FONT_CSS__"', JSON.stringify(fontCss.replace(/&amp;/g, "&")));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the game works at any sub path (e.g. GitHub Pages).
  base: "./",
  plugins: [serviceWorker()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"], // e2e/ is for Playwright
  },
});
