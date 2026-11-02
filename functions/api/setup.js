/* 临时：给回忆表加取景列。跑完立刻删掉这个文件。 */
import { json, authorized, unauthorized, noDB } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const out = [];
  try {
    await env.DB.prepare(`ALTER TABLE memories ADD COLUMN crop TEXT`).run();
    out.push('added crop');
  } catch (e) {
    out.push('skip: ' + String(e.message || e).slice(0, 60));
  }

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM memories WHERE crop IS NOT NULL`
  ).first().catch(() => null);

  return json({ ok: true, out, withCrop: row ? row.n : null });
}
