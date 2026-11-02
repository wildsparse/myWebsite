"""
make-icons.py —— 生成主屏图标（纯标准库，不用装 Pillow）

画的是一个暗底上的一枚细环，环心一个小点。呼应树洞，也像录音那颗按键。
色调取自 css/main.css 里的 --bg / --amber / --amber-hi。

    python scripts/make-icons.py

输出：
    icons/icon-512.png          主图标（也当 maskable 用，内容在中间 80% 内）
    icons/icon-192.png          安卓主屏
    icons/apple-touch-icon.png  180，iOS 会自己切圆角，所以铺满不留透明
"""

import math
import os
import struct
import zlib

BG_CENTER = (28, 23, 18)      # #1c1712
BG_EDGE = (8, 6, 5)           # #080605
RING = (217, 180, 137)        # --amber
DOT = (240, 211, 172)         # --amber-hi


def smoothstep(edge0, edge1, x):
    if edge0 == edge1:
        return 0.0 if x < edge0 else 1.0
    t = (x - edge0) / (edge1 - edge0)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return t * t * (3 - 2 * t)


def render(n):
    """返回 RGB 像素行（每行 n*3 字节）。"""
    cx = cy = (n - 1) / 2.0
    maxr = math.hypot(cx, cy)

    ring_r = 0.300 * n            # 环半径
    ring_w = 0.016 * n            # 环线宽（半宽）
    dot_r = 0.040 * n             # 环心那一点

    rows = []
    for y in range(n):
        row = bytearray()
        for x in range(n):
            dx = x - cx
            dy = y - cy
            d = math.sqrt(dx * dx + dy * dy)

            # 底色：中心稍暖，边缘沉下去
            k = min(1.0, d / maxr)
            k = k * k
            r = BG_CENTER[0] + (BG_EDGE[0] - BG_CENTER[0]) * k
            g = BG_CENTER[1] + (BG_EDGE[1] - BG_CENTER[1]) * k
            b = BG_CENTER[2] + (BG_EDGE[2] - BG_CENTER[2]) * k

            # 环外的微光，让环像是自己发亮的
            glow = math.exp(-((d - ring_r) / (0.075 * n)) ** 2) * 0.10
            r += (RING[0] - r) * glow
            g += (RING[1] - g) * glow
            b += (RING[2] - b) * glow

            # 细环
            t = abs(d - ring_r)
            a = 1.0 - smoothstep(ring_w * 0.55, ring_w, t)
            if a > 0:
                a *= 0.92
                r += (RING[0] - r) * a
                g += (RING[1] - g) * a
                b += (RING[2] - b) * a

            # 环心一点
            if d < dot_r * 1.6:
                a = 1.0 - smoothstep(dot_r * 0.55, dot_r, d)
                if a > 0:
                    a *= 0.88
                    r += (DOT[0] - r) * a
                    g += (DOT[1] - g) * a
                    b += (DOT[2] - b) * a

            row += bytes((
                max(0, min(255, int(r + 0.5))),
                max(0, min(255, int(g + 0.5))),
                max(0, min(255, int(b + 0.5))),
            ))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, n):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0)  # 8bit RGB
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print("%-34s %d x %d  %.1f KB" % (path, n, n, len(png) / 1024.0))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "icons")
    os.makedirs(out, exist_ok=True)

    for n, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")):
        write_png(os.path.join(out, name), render(n), n)


if __name__ == "__main__":
    main()
