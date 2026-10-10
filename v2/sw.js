/* 听写本 v2：缓存只属于本版本、本目录，不自动刷新当前听写。 */
const PREFIX = 'tingxieben-v2:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE = PREFIX + "d422b70dfee7430682c5";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('./index.html', SCOPE).href;
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, SCOPE).href));

function ownResponse(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const url = new URL(response.url);
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
}

async function repairMissingAssets(cache) {
  const missing = [];
  for (const url of ASSET_URLS) {
    // 最新导航页面已经保存，不让其他预缓存请求覆盖它。
    if (url !== INDEX && !(await cache.match(url))) missing.push(url);
  }
  if (missing.length) await cache.addAll(missing);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(async error => {
    await caches.delete(CACHE);
    throw error;
  }));
  // 不调用 skipWaiting。新版等待旧页面关闭后生效，避免听写中途切换。
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (ownResponse(response)) {
          event.waitUntil((async () => {
            await cache.put(INDEX, response.clone());
            await repairMissingAssets(cache);
          })().catch(() => {}));
        }
        return response;
      } catch (error) {
        const saved = await cache.match(INDEX);
        if (saved) return saved;
        throw error;
      }
    })());
    return;
  }

  // 只缓存站点静态资源；词典、其他目录、未知接口请求直接交给网络。
  url.search = '';
  if (!ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(url.href);
    if (saved) return saved;
    const response = await fetch(request);
    if (ownResponse(response)) event.waitUntil(cache.put(url.href, response.clone()));
    return response;
  })());
});
