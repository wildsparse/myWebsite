import { json, authorized, unauthorized, noDB, clean } from '../../_lib/auth.js';

const TYPES = ['memory', 'message'];
const COLS = 'id, target_type, target_id, author, text, created_at';

/* GET ?counts=1         → 每条回忆 / 留言各有几条评论
   GET ?type=&id=          → 那一条下面的全部评论 */
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDB();
  const u = new URL(request.url);

  if (u.searchParams.get('counts')) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT target_type, target_id, COUNT(*) AS n
           FROM comments
          GROUP BY target_type, target_id`
      ).all();
      const map = {};
      (results || []).forEach((r) => {
        map[r.target_type + ':' + r.target_id] = Number(r.n) || 0;
      });
      return json({ counts: map });
    } catch {
      /* 表还没建：当作没有评论，页面照常显示 */
      return json({ counts: {} });
    }
  }

  const type = u.searchParams.get('type');
  const id = u.searchParams.get('id');
  if (TYPES.indexOf(type) < 0 || !id) return json({ error: '参数不对' }, 400);

  try {
    const { results } = await env.DB.prepare(
      `SELECT ${COLS}
         FROM comments
        WHERE target_type = ? AND target_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 300`
    ).bind(type, String(id)).all();
    return json({ items: results || [] });
  } catch {
    return json({ items: [] });
  }
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return unauthorized();
  if (!env.DB) return noDB();

  let b = {};
  try { b = await request.json(); } catch { }

  const type = String(b.target_type || '');
  const id = String(b.target_id == null ? '' : b.target_id);
  if (TYPES.indexOf(type) < 0 || !id) return json({ error: '参数不对' }, 400);

  const text = clean(b.text, 600);
  if (!text) return json({ error: '还没写呢' }, 400);
  const author = clean(b.author, 20) || '匿名';
  const created = new Date().toISOString();

  let r;
  try {
    r = await env.DB.prepare(
      `INSERT INTO comments (target_type, target_id, author, text, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(type, id, author, text, created).run();
  } catch {
    return json({ error: '评论表还没建好，先在 D1 里跑一下 migrations/003-comments.sql' }, 500);
  }

  const row = await env.DB.prepare(`SELECT ${COLS} FROM comments WHERE id = ?`)
    .bind(r.meta && r.meta.last_row_id).first();

  return json({ item: row });
}
