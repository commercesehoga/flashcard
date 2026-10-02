const CACHE = "thunderstudy-shell-2026-10-03";
const SHELL = [
  "/", "/index.html", "/home.html", "/pdf.html", "/img.html", "/youtube.html", "/dack.html", "/save.html",
  "/about.html", "/faq.html", "/new.html", "/offline.html", "/favicon.svg", "/manifest.json", "/og-image.png", "/icons/icon-192.png", "/icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  const request = event.request;
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(fetch(request).then(function (response) { const copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(request, copy); }); return response; }).catch(function () { return caches.match(request).then(function (cached) { return cached || caches.match("/offline.html"); }); }));
    return;
  }
  event.respondWith(caches.match(request).then(function (cached) { return cached || fetch(request).then(function (response) { const copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(request, copy); }); return response; }); }));
});
