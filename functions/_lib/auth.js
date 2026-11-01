/* ============================================================
   公共工具：口令校验 + JSON 响应
   ============================================================ */

/* 默认答案（线上请用环境变量 TREE_KEY 覆盖它）。
   比对时忽略大小写和首尾空格，所以 "ZouZou" 也能过。 */
export const DEFAULT_KEY = 'zouzou';

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

export function getKey(env) {
  return norm((env && env.TREE_KEY) || DEFAULT_KEY);
}

export function authorized(request, env) {
  const k = norm(request.headers.get('x-tree-key'));
  return !!k && k === getKey(env);
}

export function checkKey(key, env) {
  const k = norm(key);
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
