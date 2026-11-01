import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

/* 列表：不带照片原图，避免一次拉太多字节 */
export async function onRequestGet({ env }) {
  if (!env.DB) return noDB();
  const { results } = await env.DB.prepare(
    `SELECT id, title, note, happened_at, author, photo, created_at
       FROM memories
      ORDER BY created_at DESC, id DESC
      LIMIT 200`
  ).all();
  return json({ items: results || [] });
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

  const r = await env.DB.prepare(
    `INSERT INTO memories (photo, title, note, happened_at, author, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(photo, title, note, happened, author, created).run();

  const id = r.meta && r.meta.last_row_id;
  const item = await env.DB.prepare(
    `SELECT id, title, note, happened_at, author, photo, created_at FROM memories WHERE id = ?`
  ).bind(id).first();

  return json({ item });
}
