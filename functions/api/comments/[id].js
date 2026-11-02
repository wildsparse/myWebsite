import { json, authorized, unauthorized, noDB } from '../../_lib/auth.js';

export async function onRequestDelete({ params, request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'id 不对' }, 400);

  try {
    await env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(id).run();
  } catch {
    return json({ error: '评论表还没建好' }, 500);
  }
  return json({ ok: true });
}
