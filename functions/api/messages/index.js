import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

const COLS = 'id, author, content, created_at';
const COLS_WITH_PHOTOS = 'id, author, content, photos, created_at';

/* 照片存在 photos 列里，是 JSON 数组字符串。
   列不存在时（还没跑迁移），整条链路退回没有照片的老查询。 */
function parsePhotos(v) {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function shape(row) {
  if (!row) return row;
  return Object.assign({}, row, { photos: parsePhotos(row.photos) });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return noDB();

  let results = [];
  try {
    ({ results } = await env.DB.prepare(
      `SELECT ${COLS_WITH_PHOTOS} FROM messages ORDER BY created_at DESC, id DESC LIMIT 300`
    ).all());
  } catch {
    ({ results } = await env.DB.prepare(
      `SELECT ${COLS} FROM messages ORDER BY created_at DESC, id DESC LIMIT 300`
    ).all());
  }

  return json({ items: (results || []).map(shape) });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  let b = {};
  try { b = await request.json(); } catch { }

  const content = clean(b.content, 1000);
  if (!content) return json({ error: '还没写呢' }, 400);

  const author = clean(b.author, 20) || '匿名';

  /* 最多两张，单张 400KB 以内，总长控制在 D1 单行 1MB 之下 */
  const photos = (Array.isArray(b.photos) ? b.photos : [])
    .filter(p => typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p))
    .slice(0, 2);
  const total = photos.reduce((n, p) => n + p.length, 0);
  if (photos.length && (total > 820000 || photos.some(p => p.length > 460000))) {
    return json({ error: '图太大了，换一张小点的' }, 400);
  }

  const created = new Date().toISOString();
  const packed = photos.length ? JSON.stringify(photos) : null;

  let r;
  try {
    r = await env.DB.prepare(
      `INSERT INTO messages (author, content, photos, created_at) VALUES (?, ?, ?, ?)`
    ).bind(author, content, packed, created).run();
  } catch {
    r = await env.DB.prepare(
      `INSERT INTO messages (author, content, created_at) VALUES (?, ?, ?)`
    ).bind(author, content, created).run();
  }

  const id = r.meta && r.meta.last_row_id;
  let item = null;
  try {
    item = await env.DB.prepare(
      `SELECT ${COLS_WITH_PHOTOS} FROM messages WHERE id = ?`
    ).bind(id).first();
  } catch {
    item = await env.DB.prepare(
      `SELECT ${COLS} FROM messages WHERE id = ?`
    ).bind(id).first();
  }

  return json({ item: shape(item) });
}
