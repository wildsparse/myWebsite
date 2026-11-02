/* ============================================================
   sw.js —— 让「装到主屏」之后能全屏打开，顺便断网也能看
   
   策略：网络优先，失败才用缓存。
   这么定的理由很简单——这个站一直在改，不能让她看到昨天的版本。
   所以永远先问服务器，问不到（断网）才翻缓存。
   
   不进缓存的：/api/ 下的数据（要最新）、带 Range 的请求（录音拖进度，
   缓存半截文件会坏）、/audio/（整个 mp3，没必要占地方）。
   ============================================================ */

const CACHE = 'zerort-v1';

/* 壳：第一次装上就先存好，断网至少能看见话 */
const SHELL = [
  '/',
  '/css/main.css',
  '/css/wenkai.css',
  '/js/config.js',
  '/js/app.js',
  '/js/letter.js',
  '/js/hole.js',
  '/js/api.js',
  '/manifest.json',
  '/icons/icon-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})            // 有一个没存上也不该拦住安装
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/audio/')) return;
  if (req.headers.has('range')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          /* 断网时点开页面：给它壳；别的资源找不到就算了，别拿 HTML 冒充 */
          if (req.mode === 'navigate') return caches.match('/');
          return Response.error();
        })
      )
  );
});
