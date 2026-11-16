/**
 * FitDay PWA Service Worker
 * 缓存策略：应用外壳 Cache First（缓存优先）。
 * 修改 index.html / 图标后，请同步提升 CACHE_NAME，让旧缓存自动失效。
 */
const CACHE_NAME = "fitday-pwa-v22";
const APP_SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// 将缓存中的“已跟随重定向”响应洗成普通 200 响应，避免 PWA 启动被拦截。
// 同时移除与已解码 body 不匹配的编码/长度头。
function cleanRedirectedResponse(response) {
  if (!response || !response.redirected) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("location");
  return new Response(response.body, {
    headers,
    status: response.status === 0 ? 200 : response.status,
    statusText: response.statusText
  });
}

// 首次安装：缓存应用外壳；skipWaiting 让新 SW 尽快接管。
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        const cachedIndex = await cache.match("./index.html");
        if (cachedIndex && cachedIndex.redirected) {
          await cache.put("./index.html", cleanRedirectedResponse(cachedIndex));
        }
      })
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
// 缓存命中但带重定向标记时，先洗成普通响应再返回。
// 离线且导航请求未命中时，回退到已缓存的 index.html（同样清洗重定向标记）。
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cleanRedirectedResponse(cachedResponse);
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const responseCopy = response.clone();
          const cacheResponse = responseCopy.redirected
            ? cleanRedirectedResponse(responseCopy)
            : responseCopy;
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cacheResponse).catch(() => {
              // 某些响应不可缓存时忽略，不影响网络响应返回。
            });
          });
          return response.redirected ? cleanRedirectedResponse(response) : response;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.html").then((cachedIndex) => {
              if (cachedIndex) return cleanRedirectedResponse(cachedIndex);
              return new Response("离线状态下暂无此页面", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
              });
            });
          }
          return new Response("离线状态下暂无此资源", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
    })
  );
});
