/* 临时：建地图那两张表并放几个地方。用完删掉这个文件。 */
import { json } from '../_lib/auth.js';

const SQL = [
  `CREATE TABLE IF NOT EXISTS places (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     x REAL NOT NULL,
     y REAL NOT NULL,
     kind TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS place_photos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     place_id INTEGER NOT NULL,
     photo TEXT NOT NULL,
     caption TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_places_created ON places (created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_place_photos ON place_photos (place_id, created_at ASC)`
];

const SEED = [
  ['徐州', 62.4, 37.6, null],
  ['天津', 65.2, 28.2, null],
  ['泰安', 65.0, 35.0, null],
  ['威海', 73.6, 31.2, null],
  ['济南', 66.8, 32.6, 'home']
];

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: '数据库没绑上' }, 500);
  const out = [];
  for (const s of SQL) {
    try { await env.DB.prepare(s).run(); out.push('ok'); }
    catch (e) { out.push('ERR ' + e.message); }
  }

  const u = new URL(request.url);
  if (u.searchParams.get('seed')) {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM places`).first();
    if (!n || Number(n.n) === 0) {
      for (const [name, x, y, kind] of SEED) {
        try {
          await env.DB.prepare(
            `INSERT INTO places (name, x, y, kind, created_at) VALUES (?, ?, ?, ?, ?)`
          ).bind(name, x, y, kind, new Date().toISOString()).run();
          out.push('seed ' + name);
        } catch (e) { out.push('ERR ' + name + ' ' + e.message); }
      }
    } else {
      out.push('places already has ' + n.n);
    }
  }
  return json({ out });
}
