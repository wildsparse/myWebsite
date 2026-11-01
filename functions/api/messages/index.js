import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return noDB();
  const { results } = await env.DB.prepare(
    `SELECT id, author, content, created_at
       FROM messages
      ORDER BY created_at DESC, id DESC
      LIMIT 300`
  ).all();
  return json({ items: results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  let b = {};
  try { b = await request.json(); } catch { }

  const content = clean(b.content, 1000);
  if (!content) return json({ error: '还没写呢' }, 400);

  const author = clean(b.author, 20) || '匿名';
  const created = new Date().toISOString();

  const r = await env.DB.prepare(
    `INSERT INTO messages (author, content, created_at) VALUES (?, ?, ?)`
  ).bind(author, content, created).run();

  const id = r.meta && r.meta.last_row_id;
  const item = await env.DB.prepare(
    `SELECT id, author, content, created_at FROM messages WHERE id = ?`
  ).bind(id).first();

  return json({ item });
}
