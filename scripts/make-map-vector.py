# -*- coding: utf-8 -*-
"""把行政区划的边界数据，压成网页能直接画的 SVG 路径。

输出 map/regions.json，结构：
  {
    "main":  { "w":..., "h":..., "provinces":["M...Z", ...], "cities":{"徐州":"M...Z", ...} },
    "inset": { "w":..., "h":..., "d":"M...Z" }
  }

数据来源（一次下载，见文件末尾）：
  全国省级 100000_full.json
  每个去过的市 {adcode}.json
都放在 tmp/geo/ 里。换城市、加城市时改下面的 CITIES，重跑即可。

跑法：python scripts/make-map-vector.py
"""
import json, math, os

GEO = os.environ.get('GEO_DIR') or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tmp', 'geo')

# 去过的地方。adcode 是行政区划代码，kind 里的 home 表示现在住的地方。
CITIES = [
    ('120000', '天津', None),
    ('320300', '徐州', None),
    ('370100', '济南', 'home'),
    ('370900', '泰安', None),
    ('371000', '威海', None),
]

# 等积圆锥投影，标准纬线 25/47，中央经线 105。中国地图的常规画法。
LON0, LAT1, LAT2, LAT0 = 105.0, 25.0, 47.0, 35.0


def albers(lon, lat):
    r = math.radians
    n = (math.sin(r(LAT1)) + math.sin(r(LAT2))) / 2
    C = math.cos(r(LAT1)) ** 2 + 2 * n * math.sin(r(LAT1))
    rho = math.sqrt(max(C - 2 * n * math.sin(r(lat)), 1e-9)) / n
    rho0 = math.sqrt(C - 2 * n * math.sin(r(LAT0))) / n
    th = n * r(lon - LON0)
    return rho * math.sin(th), rho0 - rho * math.cos(th)


def rings(geom):
    """外环列表。孔洞不要，画不到那么细。"""
    cs = geom['coordinates']
    if geom['type'] == 'Polygon':
        return [cs[0]]
    return [poly[0] for poly in cs]


def rdp(pts, eps):
    """Douglas-Peucker，把一条线上可有可无的点去掉。"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if norm < 1e-12:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dx * (ay - py) - (ax - px) * dy) / norm
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def to_path(rings_px):
    """一组环 → 一条 SVG path。坐标保留一位小数。"""
    out = []
    for ring in rings_px:
        if len(ring) < 3:
            continue
        cmd = 'M'
        for x, y in ring:
            out.append('%s%.1f %.1f' % (cmd, x, y))
            cmd = 'L'
        out.append('Z')
    return ''.join(out)


def load(name):
    with open(os.path.join(GEO, name), encoding='utf-8') as f:
        return json.load(f)


def main():
    prov = load('100000_full.json')

    # 分成主图和插图：海南省的南海诸岛、九段线，都放插图
    main_rings, inset_rings = [], []
    for f in prov['features']:
        name = f['properties'].get('name') or '九段线'
        for ring in rings(f['geometry']):
            lats = [p[1] for p in ring]
            if (name == '海南省' and max(lats) < 17.5) or name == '九段线':
                inset_rings.append(ring)
            else:
                main_rings.append(ring)

    # 主图：投影、算包围盒
    proj = [[albers(lon, lat) for lon, lat in r] for r in main_rings]
    xs = [p[0] for r in proj for p in r]
    ys = [p[1] for r in proj for p in r]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)

    W = 1000.0
    scale = W / (x1 - x0)
    H = (y1 - y0) * scale

    # 右边留一条空：台湾省一直伸到 946，右下角没地方放南海诸岛。
    # 地图本身还是画在 0..1000 里，只是画布宽一点。
    PAD_RIGHT = 100.0

    def to_px(p):
        return ((p[0] - x0) * scale, (y1 - p[1]) * scale)

    EPS = 0.7  # 以画布像素计，肉眼看不出

    provinces = []
    for r in proj:
        pts = [to_px(p) for p in r]
        provinces.append(to_path([rdp(pts, EPS)]))

    cities = {}
    for code, name, _kind in CITIES:
        f = load(code + '.json')['features'][0]
        pieces = []
        for ring in rings(f['geometry']):
            pts = [to_px(albers(lon, lat)) for lon, lat in ring]
            pieces.append(rdp(pts, EPS))
        cities[name] = to_path(pieces)

    # 插图：单独一套坐标，右下角那一小块
    ip = [[albers(lon, lat) for lon, lat in r] for r in inset_rings]
    ixs = [p[0] for r in ip for p in r]
    iys = [p[1] for r in ip for p in r]
    ix0, ix1, iy0, iy1 = min(ixs), max(ixs), min(iys), max(iys)
    iw = 200.0
    isc = iw / (ix1 - ix0)
    ih = (iy1 - iy0) * isc

    def to_ipx(p):
        return ((p[0] - ix0) * isc, (iy1 - p[1]) * isc)

    inset = to_path([rdp([to_ipx(p) for p in r], 0.5) for r in ip])

    out = {
        'main': {'w': round(W + PAD_RIGHT, 1), 'h': round(H, 1),
                 'provinces': provinces, 'cities': cities},
        'inset': {'w': round(iw, 1), 'h': round(ih, 1), 'd': inset},
    }
    dst = os.path.join(os.path.dirname(__file__), '..', 'map', 'regions.json')
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

    size = os.path.getsize(dst)
    print('主图 %.0f x %.0f（画布 %.0f x %.0f）' % (W, H, W + PAD_RIGHT, H))
    print('省 %d 个，市 %d 个' % (len(provinces), len(cities)))
    print('写出 %s，%.0f KB' % (os.path.basename(dst), size / 1024))


if __name__ == '__main__':
    main()
