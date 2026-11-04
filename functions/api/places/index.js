import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

/* 地图上的地方。
   GET  → 全部地点，附带每个地方有几张照片（不带图，省流量）
   POST → 加一个地方（要口令）
   DEL  → 去掉一个地方（要口令） */

export async function onRequestGet({ env }) {
  if (!env.DB) return noDB();
  let places = [], counts = {};
  try {
    ({ results: places } = await env.DB.prepare(
      `SELECT id, name, x, y, kind, created_at FROM places ORDER BY created_at ASC, id ASC`
    ).all());

    let rows = [];
    ({ results: rows } = await env.DB.prepare(
      `SELECT place_id, COUNT(*) AS n FROM place_photos GROUP BY place_id`
    ).all());
    (rows || []).forEach((r) => { counts[r.place_id] = Number(r.n) || 0; });
  } catch {
    /* 表还没建：地图退回配置里写死的那几个点 */
    return json({ items: [], ready: false });
  }

  return json({
    ready: true,
    items: (places || []).map((p) => Object.assign({}, p, { count: counts[p.id] || 0 }))
  });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  let b = {};
  try { b = await request.json(); } catch { }

  const name = clean(b.name, 24);
  const x = Number(b.x), y = Number(b.y);
  if (!name) return json({ error: '还没写地名' }, 400);
  if (!(x >= 0 && x <= 100) || !(y >= 0 && y <= 100)) {
    return json({ error: '位置不对' }, 400);
  }

  const created = new Date().toISOString();
  const r = await env.DB.prepare(
    `INSERT INTO places (name, x, y, kind, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(name, x, y, clean(b.kind, 12), created).run();

  const row = await env.DB.prepare(
    `SELECT id, name, x, y, kind, created_at FROM places WHERE id = ?`
  ).bind(r.meta && r.meta.last_row_id).first();

  return json({ item: Object.assign({}, row, { count: 0 }) });
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: '参数不对' }, 400);

  await env.DB.prepare(`DELETE FROM place_photos WHERE place_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM places WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
