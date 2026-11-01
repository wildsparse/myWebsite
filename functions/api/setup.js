import { json, authorized, unauthorized, noDB } from '../_lib/auth.js';

/* 临时迁移接口：跑完就删。
   只有带对口令才能调用，且每条语句单独 try，
   已经加过的字段会跳过，不会把库弄坏。 */
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  const cmds = [
    `ALTER TABLE messages ADD COLUMN photos TEXT`,
    `CREATE TABLE IF NOT EXISTS todos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      text        TEXT NOT NULL,
      done        INTEGER NOT NULL DEFAULT 0,
      author      TEXT,
      created_at  TEXT NOT NULL,
      done_at     TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_todos_created ON todos (created_at DESC)`
  ];

  const out = [];
  for (const sql of cmds) {
    const tag = sql.replace(/\s+/g, ' ').slice(0, 46);
    try {
      await env.DB.prepare(sql).run();
      out.push({ ok: true, sql: tag });
    } catch (e) {
      out.push({ ok: false, sql: tag, msg: String(e && e.message || e) });
    }
  }

  /* 跑完核对一下真实结构 */
  const check = {};
  try {
    const m = await env.DB.prepare(`PRAGMA table_info(messages)`).all();
    check.messages = (m.results || []).map(c => c.name);
  } catch (e) { check.messages = String(e.message || e); }
  try {
    const t = await env.DB.prepare(`PRAGMA table_info(todos)`).all();
    check.todos = (t.results || []).map(c => c.name);
  } catch (e) { check.todos = String(e.message || e); }

  return json({ out, check });
}
