import { json, authorized, unauthorized, noDB, clean } from '../_lib/auth.js';

/* 一个地方下面的照片。
   GET  ?place=1 → 那个地方的全部照片
   POST           → 添一张（要口令，图已在前端压过） */

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDB();
  const place = new URL(request.url).searchParams.get('place');
  if (!place) return json({ error: '参数不对' }, 400);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, photo, caption, created_at
         FROM place_photos
        WHERE place_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 60`
    ).bind(place).all();
    return json({ items: results || [] });
  } catch {
    return json({ items: [] });
  }
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  let b = {};
  try { b = await request.json(); } catch { }

  const place = b.place_id;
  const photo = b.photo ? String(b.photo) : '';
  if (!place) return json({ error: '不知道是哪儿的照片' }, 400);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
    return json({ error: '图片格式不对' }, 400);
  }
  if (photo.length > 820000) return json({ error: '这张图还是太大了' }, 413);

  const created = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO place_photos (place_id, photo, caption, created_at) VALUES (?, ?, ?, ?)`
  ).bind(place, photo, clean(b.caption, 120), created).run();

  const row = await env.DB.prepare(
    `SELECT id, caption, created_at FROM place_photos WHERE id = ?`
  ).bind(r.meta && r.meta.last_row_id).first();

  /* 列表里不缺这张图，但立刻回传整张会让响应很大，所以只回元信息 */
  return json({ item: Object.assign({}, row, { photo }) });
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: '参数不对' }, 400);
  await env.DB.prepare(`DELETE FROM place_photos WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
