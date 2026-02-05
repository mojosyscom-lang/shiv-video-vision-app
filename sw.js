const CACHE_NAME = "svv-v31"; // 🔥 change version when you update files

const ASSETS = [
  "./",
  "index.html",
  "login.html",
  "app.html",

  "css/style.css?v=30",
  "css/dark.css?v=30",

  "js/api.js",
  "js/auth.js",
  "js/sync.js",
  "js/accounting.js",
  "js/nozoom.js",

  "assets/logo.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "manifest.json"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// Network-first for HTML (always fresh), cache-first for others
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // HTML: always try network first
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("app.html")))
    );
    return;
  }

  // CSS/JS/Images: cache-first, then network update
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});