const CACHE = "stockforge-v2";
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

const cacheable = (url) =>
  url.origin === self.location.origin &&
  !url.pathname.startsWith("/api/") &&
  !url.pathname.includes("hot-update") &&
  !url.pathname.startsWith("/sockjs") &&
  !url.pathname.startsWith("/ws");

const offlineApi = (url) => /\/api\/(snapshot|markets)$/.test(url.pathname);
const hashedAsset = (url) => url.pathname.startsWith("/assets/"); // content-hashed by Vite: immutable

const store = (req, res) => {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy)); }
  return res;
};

// Network first, but never make the user wait on a dead connection: fall back to cache after `ms`.
const networkFirst = (req, ms) =>
  new Promise((resolve) => {
    const fallback = () => caches.match(req.mode === "navigate" ? "/" : req).then((r) => r || caches.match("/"));
    const timer = setTimeout(() => fallback().then((r) => r && resolve(r)), ms);
    fetch(req)
      .then((res) => { clearTimeout(timer); resolve(store(req, res)); })
      .catch(() => { clearTimeout(timer); fallback().then(resolve); });
  });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url) && !offlineApi(url)) return;
  if (hashedAsset(url)) {
    // Cache-first: hashed bundles never change, so repeat visits skip the network entirely.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => store(req, res))));
    return;
  }
  e.respondWith(networkFirst(req, 3500));
});
