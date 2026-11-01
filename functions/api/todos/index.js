import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return noDB();

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, text, done, author, created_at, done_at
         FROM todos
        ORDER BY done ASC, created_at DESC, id DESC
        LIMIT 500`
    ).all();
    return json({ items: results || [] });
  } catch {
    /* 还没建表，先当作空清单，别让整个页面报错 */
    return json({ items: [], needsMigration: true });
  }
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  let b = {};
  try { b = await request.json(); } catch { }

  const text = clean(b.text, 80);
  if (!text) return json({ error: '写一件想做的事' }, 400);

  const author = clean(b.author, 20) || '匿名';
  const created = new Date().toISOString();

  try {
    const r = await env.DB.prepare(
      `INSERT INTO todos (text, done, author, created_at) VALUES (?, 0, ?, ?)`
    ).bind(text, author, created).run();

    const item = await env.DB.prepare(
      `SELECT id, text, done, author, created_at, done_at FROM todos WHERE id = ?`
    ).bind(r.meta && r.meta.last_row_id).first();

    return json({ item });
  } catch {
    return json({ error: '清单表还没建好，看看部署说明' }, 500);
  }
}
