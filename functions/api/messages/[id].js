import { json, authorized, unauthorized, noDB } from '../../_lib/auth.js';

export async function onRequestDelete({ params, request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: 'id 不对' }, 400);

  await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
