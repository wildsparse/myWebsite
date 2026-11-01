/* ============================================================
   公共工具：口令校验 + JSON 响应
   ============================================================ */

/* 默认口令。
   强烈建议：在 Cloudflare Pages 后台设置环境变量 TREE_KEY，把这里留作兜底。
   也可以直接改下面这一行，然后重新部署。 */
export const DEFAULT_KEY = 'laile';

export function getKey(env) {
  return (env && env.TREE_KEY) || DEFAULT_KEY;
}

export function authorized(request, env) {
  const k = request.headers.get('x-tree-key') || '';
  return !!k && k === getKey(env);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export function unauthorized() {
  return json({ error: '口令不对' }, 401);
}

export function noDB() {
  return json({ error: '数据库还没绑定，看看部署说明里的第二步' }, 500);
}

export function clean(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}
