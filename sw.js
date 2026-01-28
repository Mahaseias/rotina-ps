const CACHE = "rotina-cache-v1";
const ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.webmanifest",
    "./data/recursos.json"
  ];
  

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE ? caches.delete(k) : null)))
  );
});

self.addEventListener("fetch", (e)=>{
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
