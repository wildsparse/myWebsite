import { json, checkKey } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { }
  const ok = checkKey(body && body.key, env);
  return json({ ok }, ok ? 200 : 401);
}
