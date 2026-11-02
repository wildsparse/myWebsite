import { json, authorized, unauthorized, noDB } from '../../_lib/auth.js';

export async function onRequestDelete({ params, request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'id 不对' }, 400);

  await env.DB.prepare(`DELETE FROM memories WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

/* 只改卡片取景，不动照片和文字 */
export async function onRequestPatch({ params, request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'id 不对' }, 400);

  let b = {};
  try { b = await request.json(); } catch { }

  const c = b.crop;
  let packed = null;
  if (c && typeof c === 'object') {
    const n = (k) => (typeof c[k] === 'number' && c[k] >= 0 && c[k] <= 1 ? c[k] : null);
    const x = n('x'), y = n('y'), w = n('w'), h = n('h');
    if (w && h && x !== null && y !== null) {
      packed = JSON.stringify({ x, y, w, h });
    }
  }

  try {
    await env.DB.prepare(`UPDATE memories SET crop = ? WHERE id = ?`).bind(packed, id).run();
  } catch {
    return json({ error: '取景这一列还没加上，先跑 migrations/004-crop.sql' }, 500);
  }

  return json({ ok: true, crop: packed ? JSON.parse(packed) : null });
}
