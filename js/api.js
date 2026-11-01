/* ============================================================
   api.js —— 数据读写
   线上：走 Cloudflare Pages Functions + D1
   本地：直接打开 index.html 时自动降级到 localStorage（仅供预览）
   ============================================================ */

const API = (function () {
  const K_KEY = 'th.key';
  const K_MEM = 'th.local.memories';
  const K_MSG = 'th.local.messages';

  let mode = null;          // 'remote' | 'local'
  let memCache = [];        // 本地模式下的缓存
  let memLoaded = false;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nowISO = () => new Date().toISOString();

  function readLS(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  }
  function writeLS(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('本地存储失败', e); }
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

  /* ---------- 口令校验（本地模式下本地比对） ---------- */
  async function verifyKey(k) {
    if (await probe() === 'remote') {
      const r = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k })
      });
      return r.ok;
    }
    return k.trim().length > 0;
  }

  return {
    probe, getKey, setKey, clearKey, hasKey, verifyKey,
    listMemories, addMemory, delMemory,
    listMessages, addMessage, delMessage
  };
})();
