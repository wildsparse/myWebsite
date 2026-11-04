/* ============================================================
   api.js —— 数据读写
   线上：走 Cloudflare Pages Functions + D1
   本地：直接打开 index.html 时自动降级到 localStorage（仅供预览）
   ============================================================ */

const API = (function () {
  const K_KEY = 'th.key';
  const K_MEM = 'th.local.memories';
  const K_MSG = 'th.local.messages';
  const K_TODO = 'th.local.todos';
  const K_CMT = 'th.local.comments';
  const K_PLACE = 'th.local.places';
  const K_PHOTO = 'th.local.placePhotos';

  let mode = null;          // 'remote' | 'local'
  let memCache = [];        // 本地模式下的缓存
  let memLoaded = false;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nowISO = () => new Date().toISOString();

  function readLS(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  }
  function writeLS(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) {
      console.warn('本地存储失败', e);
      /* 只有本地预览会走到这儿：浏览器给的额度很小，塞不下太多照片。
         线上是数据库，不会遇到。 */
      throw new Error('浏览器本地存不下了，先删掉几条，或者等上线后用');
    }
  }

  async function probe() {
    if (mode) return mode;
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      const j = await r.json();
      mode = j && j.ok ? 'remote' : 'local';
    } catch { mode = 'local'; }
    return mode;
  }

  /* ---------- 口令 ---------- */
  const getKey = () => localStorage.getItem(K_KEY) || '';
  const setKey = (k) => localStorage.setItem(K_KEY, k);
  const clearKey = () => localStorage.removeItem(K_KEY);
  const hasKey = () => !!getKey();

  async function req(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const k = getKey();
    if (k) headers['x-tree-key'] = k;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    let body = null;
    try { body = await res.json(); } catch { }
    if (res.status === 401) { clearKey(); throw new Error('KEY'); }
    if (!res.ok) throw new Error((body && body.error) || ('HTTP ' + res.status));
    return body;
  }

  /* ---------- 地图上的地方 ---------- */
  async function listPlaces() {
    if (await probe() === 'remote') {
      const j = await req('/api/places');
      return { items: (j && j.items) || [], ready: !!(j && j.ready) };
    }
    const places = readLS(K_PLACE, []);
    const shots = readLS(K_PHOTO, []);
    return {
      ready: true,
      items: places.map((p) => Object.assign({}, p, {
        count: shots.filter((x) => String(x.place_id) === String(p.id)).length
      }))
    };
  }

  async function addPlace(data) {
    if (await probe() === 'remote') {
      const j = await req('/api/places', { method: 'POST', body: JSON.stringify(data) });
      return j.item;
    }
    const list = readLS(K_PLACE, []);
    const item = Object.assign({ id: uid(), created_at: nowISO() }, data);
    list.push(item);
    writeLS(K_PLACE, list);
    return Object.assign({ count: 0 }, item);
  }

  async function delPlace(id) {
    if (await probe() === 'remote') {
      await req('/api/places?id=' + encodeURIComponent(id), { method: 'DELETE' });
      return true;
    }
    writeLS(K_PLACE, readLS(K_PLACE, []).filter((p) => String(p.id) !== String(id)));
    writeLS(K_PHOTO, readLS(K_PHOTO, []).filter((p) => String(p.place_id) !== String(id)));
    return true;
  }

  async function listPlacePhotos(id) {
    if (await probe() === 'remote') {
      const j = await req('/api/place-photos?place=' + encodeURIComponent(id));
      return (j && j.items) || [];
    }
    return readLS(K_PHOTO, []).filter((p) => String(p.place_id) === String(id));
  }

  async function addPlacePhoto(data) {
    if (await probe() === 'remote') {
      const j = await req('/api/place-photos', { method: 'POST', body: JSON.stringify(data) });
      return j.item;
    }
    const list = readLS(K_PHOTO, []);
    const item = Object.assign({ id: uid(), created_at: nowISO() }, data);
    list.push(item);
    writeLS(K_PHOTO, list);
    return item;
  }

  /* ---------- 回忆 ---------- */
  async function listMemories() {
    if (await probe() === 'remote') {
      const j = await req('/api/memories');
      return (j && j.items) || [];
    }
    if (!memLoaded) {
      memCache = readLS(K_MEM, []);
      memLoaded = true;
    }
    return memCache.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function addMemory(data) {
    if (await probe() === 'remote') {
      const j = await req('/api/memories', { method: 'POST', body: JSON.stringify(data) });
      return j.item;
    }
    const item = Object.assign({ id: uid(), created_at: nowISO() }, data);
    memCache = readLS(K_MEM, []);
    memCache.unshift(item);
    writeLS(K_MEM, memCache);
    return item;
  }

  async function delMemory(id) {
    if (await probe() === 'remote') {
      await req('/api/memories/' + id, { method: 'DELETE' });
      return true;
    }
    memCache = readLS(K_MEM, []).filter(x => String(x.id) !== String(id));
    writeLS(K_MEM, memCache);
    return true;
  }

  /* 只改卡片上显示哪一块，照片本身不动 */
  async function setMemoryCrop(id, crop) {
    if (await probe() === 'remote') {
      await req('/api/memories/' + id, { method: 'PATCH', body: JSON.stringify({ crop }) });
      return true;
    }
    memCache = readLS(K_MEM, []).map(x =>
      String(x.id) === String(id) ? Object.assign({}, x, { crop }) : x
    );
    writeLS(K_MEM, memCache);
    return true;
  }

  /* ---------- 留言 ---------- */
  async function listMessages() {
    if (await probe() === 'remote') {
      const j = await req('/api/messages');
      return (j && j.items) || [];
    }
    return readLS(K_MSG, []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async function addMessage(data) {
    if (await probe() === 'remote') {
      const j = await req('/api/messages', { method: 'POST', body: JSON.stringify(data) });
      return j.item;
    }
    const item = Object.assign({ id: uid(), created_at: nowISO() }, data);
    const arr = readLS(K_MSG, []);
    arr.unshift(item);
    writeLS(K_MSG, arr);
    return item;
  }

  async function delMessage(id) {
    if (await probe() === 'remote') {
      await req('/api/messages/' + id, { method: 'DELETE' });
      return true;
    }
    writeLS(K_MSG, readLS(K_MSG, []).filter(x => String(x.id) !== String(id)));
    return true;
  }

  /* ---------- 一起做清单 ---------- */
  const sortTodos = (a) =>
    a.slice().sort((x, y) => {
      if (!!x.done !== !!y.done) return x.done ? 1 : -1;
      return String(y.created_at).localeCompare(String(x.created_at));
    });

  async function listTodos() {
    if (await probe() === 'remote') {
      const j = await req('/api/todos');
      return (j && j.items) || [];
    }
    return sortTodos(readLS(K_TODO, []));
  }

  async function addTodo(data) {
    if (await probe() === 'remote') {
      const j = await req('/api/todos', { method: 'POST', body: JSON.stringify(data) });
      return j.item;
    }
    const item = Object.assign({ id: uid(), done: 0, created_at: nowISO(), done_at: null }, data);
    const arr = readLS(K_TODO, []);
    arr.unshift(item);
    writeLS(K_TODO, arr);
    return item;
  }

  async function toggleTodo(id, done) {
    if (await probe() === 'remote') {
      const j = await req('/api/todos/' + id, { method: 'PATCH', body: JSON.stringify({ done }) });
      return j.item;
    }
    const arr = readLS(K_TODO, []).map(x =>
      String(x.id) === String(id)
        ? Object.assign({}, x, { done: done ? 1 : 0, done_at: done ? nowISO() : null })
        : x
    );
    writeLS(K_TODO, arr);
    return arr.find(x => String(x.id) === String(id));
  }

  async function delTodo(id) {
    if (await probe() === 'remote') {
      await req('/api/todos/' + id, { method: 'DELETE' });
      return true;
    }
    writeLS(K_TODO, readLS(K_TODO, []).filter(x => String(x.id) !== String(id)));
    return true;
  }

  /* ---------- 评论 ---------- */
  /* 一次把所有目标下的评论条数拿回来，列表上就能显示「3 条评论」，
     不用为每条回忆发一次请求。 */
  async function listCommentCounts() {
    if (await probe() === 'remote') {
      const j = await req('/api/comments?counts=1');
      return (j && j.counts) || {};
    }
    const map = {};
    readLS(K_CMT, []).forEach((c) => {
      const k = c.target_type + ':' + c.target_id;
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  async function listComments(type, id) {
    if (await probe() === 'remote') {
      const j = await req('/api/comments?type=' + encodeURIComponent(type) +
                          '&id=' + encodeURIComponent(id));
      return (j && j.items) || [];
    }
    return readLS(K_CMT, []).filter(c =>
      c.target_type === type && String(c.target_id) === String(id)
    );
  }

  async function addComment(data) {
    if (await probe() === 'remote') {
      const j = await req('/api/comments', { method: 'POST', body: JSON.stringify(data) });
      return j.item;
    }
    const item = Object.assign({ id: uid(), created_at: nowISO() }, data, {
      target_id: String(data.target_id)
    });
    const arr = readLS(K_CMT, []);
    arr.push(item);
    writeLS(K_CMT, arr);
    return item;
  }

  async function delComment(id) {
    if (await probe() === 'remote') {
      await req('/api/comments/' + id, { method: 'DELETE' });
      return true;
    }
    writeLS(K_CMT, readLS(K_CMT, []).filter(x => String(x.id) !== String(id)));
    return true;
  }

  /* ---------- 口令校验（本地预览时用 config 里的答案比对） ---------- */
  async function verifyKey(k) {
    if (await probe() === 'remote') {
      const r = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k })
      });
      return r.ok;
    }
    const expected = String((typeof HOLE !== 'undefined' && HOLE.localKey) || '').trim().toLowerCase();
    if (!expected) return true;
    return k.trim().toLowerCase() === expected;
  }

  /* 浏览器里记住的口令还算不算数。
     本地预览时和 localKey 比对，避免旧口令一直放行、看不到弹窗。 */
  async function checkStoredKey() {
    const k = getKey();
    if (!k) return false;
    if (await probe() === 'remote') return true;
    const expected = String((typeof HOLE !== 'undefined' && HOLE.localKey) || '').trim().toLowerCase();
    if (!expected) return true;
    if (k.trim().toLowerCase() !== expected) {
      clearKey();
      return false;
    }
    return true;
  }

  return {
    probe, getKey, setKey, clearKey, hasKey, verifyKey, checkStoredKey,
    listMemories, addMemory, delMemory, setMemoryCrop,
    listMessages, addMessage, delMessage,
    listTodos, addTodo, toggleTodo, delTodo,
    listCommentCounts, listComments, addComment, delComment,
    listPlaces, addPlace, delPlace, listPlacePhotos, addPlacePhoto
  };
})();
