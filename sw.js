const CACHE_NAME = "transit-v1";
const CORE_ASSETS = ["./index.html", "./style.css?v=202611021212", "./app.js", "./manifest.json"];
const CDN_ASSETS = [
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS).catch(() => {});
      await Promise.all(CDN_ASSETS.map((u) => fetch(u).then((r) => cache.put(u, r)).catch(() => {})));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("openstreetmap.org")) return; // map tiles: the browser handles them
  if (url.origin === self.location.origin) {
    // our own files: always fresh from the network, cache only as the offline fallback
    event.respondWith(fetch(req, { cache: "no-store" }).then((r) => { const c = r.clone(); caches.open(CACHE_NAME).then((ch) => ch.put(req, c)); return r; }).catch(() => caches.match(req)));
  } else {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
