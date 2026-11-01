import { json, getKey } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { }
  const key = (body && body.key) || '';
  const ok = !!key && key === getKey(env);
  return json({ ok }, ok ? 200 : 401);
}
