/* ============================================================
   sw.js —— 已经不用的空壳，只剩一件事：把自己注销掉

   这个文件短暂地当过「装到主屏」的一部分（缓存页面、断网也能打开）。
   那个功能撤掉了，但 service worker 有个麻烦的地方：
   只要某台设备注册过，光删掉这个文件是删不掉的，它会一直留在那台设备上。

   所以留这个壳。浏览器每次打开都会来取一次 sw.js，拿到这份新代码就会
   装上去、激活，然后把自己注销、把缓存清空。之后这台设备就干净了。

   过一两个月（确认没有设备还带着旧版）就可以把这个文件整个删掉。
   ============================================================ */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* 没缓存可清就算了 */ }
    try {
      await self.registration.unregister();
    } catch (e) { /* 注销失败也不影响页面 */ }
  })());
});
