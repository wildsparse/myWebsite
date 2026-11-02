/* 临时：把评论表建出来。跑完立刻删掉这个文件。 */
import { json, authorized, unauthorized, noDB } from '../_lib/auth.js';

const SQL = [
  `CREATE TABLE IF NOT EXISTS comments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     target_type TEXT NOT NULL,
     target_id TEXT NOT NULL,
     author TEXT,
     text TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (target_type, target_id, created_at)`
];

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const done = [];
  for (const sql of SQL) {
    await env.DB.prepare(sql).run();
    done.push(sql.replace(/\s+/g, ' ').slice(0, 50));
  }
  return json({ ok: true, done });
}
