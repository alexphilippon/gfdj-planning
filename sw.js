// Service worker minimal : rend l'app installable et affiche la dernière version connue hors connexion.
const CACHE = "gfdj-planning-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // tout le reste passe directement par le réseau
  e.respondWith(fetch(e.request).catch(() => caches.match("./index.html")));
});
