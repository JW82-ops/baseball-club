// 오프라인 플레이용 서비스 워커
// 코드(html·js·css)는 네트워크 우선: 새 버전이 바로 반영되고, 인터넷이 없으면 저장본으로 실행
// 그림(webp·png·svg)은 저장본 우선: 한 번 본 그림은 빠르게, 오프라인에서도 보여요
const CACHE = 'bc-v8';
const SHELL = ['./', './index.html', './manifest.json', './css/style.css', './js/main.js', './img/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isImg = /\.(webp|png|jpg|jpeg|svg|gif)$/i.test(url.pathname);
  if (isImg) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
});
