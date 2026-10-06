// Service worker: makes the game installable and playable offline.
// This file is a template; the build (vite.config.ts) fills in VERSION and FILES with every
// file of that build, so a new deploy gets a new cache and the old one is removed.

const VERSION = "__VERSION__";
const FILES = __FILES__;
const FONT_CSS = "__FONT_CSS__";
const CACHE = `word-weaver-${VERSION}`;
const FONT_CACHE = "word-weaver-fonts";

/** Stores the Google Fonts stylesheet and its font files. Best effort: never fails the install. */
async function cacheFonts() {
  try {
    const cache = await caches.open(FONT_CACHE);
    const css = await fetch(FONT_CSS);
    if (!css.ok) return;
    const text = await css.clone().text();
    await cache.put(FONT_CSS, css);
    const fontUrls = [...text.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(fontUrls.map((url) => fetch(url).then((r) => r.ok && cache.put(url, r))));
  } catch {
    // Offline or blocked: fonts will be stored on a later visit.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => (FONT_CSS ? cacheFonts() : undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Google Fonts: use the stored copy, refresh it in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok || response.type === "opaque") cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? fresh;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // The page itself: try the network first so updates arrive, fall back to the stored copy.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./", copy));
          return response;
        })
        .catch(() => caches.match("./", { ignoreSearch: true, ignoreVary: true }))
    );
    return;
  }

  // Everything else (scripts, styles, puzzles, images): stored copy first.
  event.respondWith(caches.match(request, { ignoreSearch: true, ignoreVary: true }).then((cached) => cached ?? fetch(request)));
});
