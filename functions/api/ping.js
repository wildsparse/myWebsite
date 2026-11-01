import { json } from '../_lib/auth.js';

export async function onRequestGet() {
  return json({ ok: true, v: 1 });
}
