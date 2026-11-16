/**
 * FitDay PWA Service Worker
 * 缓存策略：应用外壳 Cache First（缓存优先）。
 * 修改 index.html / 图标后，请同步提升 CACHE_NAME，让旧缓存自动失效。
 */
const CACHE_NAME = "fitday-pwa-v20";
const APP_SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// 首次安装：缓存应用外壳；skipWaiting 让新 SW 尽快接管。
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存，并让当前页面立即受控。
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 请求处理：缓存优先；未命中时走网络，并顺手缓存同源 GET 响应。
// 离线且导航请求未命中时，回退到已缓存的 index.html。
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseCopy);
          });
          return response;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("离线状态下暂无此资源", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
    })
  );
});
