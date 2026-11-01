import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

/* PATCH：勾掉 / 撤销勾选 */
export async function onRequestPatch({ request, env, params }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: '哪一件？' }, 400);

  let b = {};
  try { b = await request.json(); } catch { }

  const done = b.done ? 1 : 0;
  const doneAt = done ? new Date().toISOString() : null;

  try {
    await env.DB.prepare(
      `UPDATE todos SET done = ?, done_at = ? WHERE id = ?`
    ).bind(done, doneAt, id).run();

    const item = await env.DB.prepare(
      `SELECT id, text, done, author, created_at, done_at FROM todos WHERE id = ?`
    ).bind(id).first();

    return json({ item });
  } catch {
    return json({ error: '没改成，等下再试' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ error: '哪一件？' }, 400);

  try {
    await env.DB.prepare(`DELETE FROM todos WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  } catch {
    return json({ error: '没删掉，等下再试' }, 500);
  }
}
