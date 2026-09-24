// Service worker minimal : rend l'app installable et affiche la dernière version connue hors connexion.
const CACHE = "gfdj-planning-v2";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // tout le reste passe directement par le réseau
  // Toujours la dernière version de la page (et donc des fichiers versionnés qu'elle appelle)
  e.respondWith(fetch(e.request.url, { cache: "no-store", credentials: "same-origin" }).catch(() => caches.match("./index.html")));
});
