import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

/* crop 存在一列里，是 JSON。列不存在（还没跑 004 迁移）时，
   整条链路退回没有取景的老查询，页面不会坏。 */
function parseCrop(v) {
  if (!v) return null;
  try {
    const o = JSON.parse(v);
    if (!o || typeof o !== 'object') return null;
    const n = (k) => (typeof o[k] === 'number' && o[k] >= 0 && o[k] <= 1 ? o[k] : null);
    const x = n('x'), y = n('y'), w = n('w'), h = n('h');
    if (x === null || y === null || !w || !h) return null;
    return { x, y, w, h };
  } catch {
    return null;
  }
}

function shape(row) {
  if (!row) return row;
  return Object.assign({}, row, { crop: parseCrop(row.crop) });
}

/* 列表：不带照片原图，避免一次拉太多字节 */
export async function onRequestGet({ env }) {
  if (!env.DB) return noDB();
  let results = [];
  try {
    ({ results } = await env.DB.prepare(
      `SELECT id, title, note, happened_at, author, photo, crop, created_at
         FROM memories
        ORDER BY created_at DESC, id DESC
        LIMIT 200`
    ).all());
  } catch {
    ({ results } = await env.DB.prepare(
      `SELECT id, title, note, happened_at, author, photo, created_at
         FROM memories
        ORDER BY created_at DESC, id DESC
        LIMIT 200`
    ).all());
  }
  return json({ items: (results || []).map(shape) });
}

/* 新增 */
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  let b = {};
  try { b = await request.json(); } catch { }

  const photo = b.photo ? String(b.photo) : null;
  if (photo) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
      return json({ error: '图片格式不对' }, 400);
    }
    if (photo.length > 820000) {
      return json({ error: '这张图还是太大了' }, 413);
    }
  }

  const title = clean(b.title, 60);
  const note = clean(b.note, 800);
  if (!photo && !title && !note) {
    return json({ error: '空的，写点什么' }, 400);
  }

  const happened = clean(b.happened_at, 20);
  const author = clean(b.author, 20);
  const created = new Date().toISOString();

  /* 卡片取景：四个 0–1 的数，别的都当没传 */
  const crop = parseCrop(b.crop ? JSON.stringify(b.crop) : null);
  const packed = crop ? JSON.stringify(crop) : null;

  let r;
  try {
    r = await env.DB.prepare(
      `INSERT INTO memories (photo, title, note, happened_at, author, crop, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(photo, title, note, happened, author, packed, created).run();
  } catch {
    /* 还没跑 004 迁移 */
    r = await env.DB.prepare(
      `INSERT INTO memories (photo, title, note, happened_at, author, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(photo, title, note, happened, author, created).run();
  }

  const id = r.meta && r.meta.last_row_id;
  let item = null;
  try {
    item = await env.DB.prepare(
      `SELECT id, title, note, happened_at, author, photo, crop, created_at FROM memories WHERE id = ?`
    ).bind(id).first();
  } catch {
    item = await env.DB.prepare(
      `SELECT id, title, note, happened_at, author, photo, created_at FROM memories WHERE id = ?`
    ).bind(id).first();
  }

  return json({ item: shape(item) });
}
