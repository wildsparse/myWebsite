"""把标准地图处理成一张只有线条的透明底图片。

底图来自「自然资源部标准地图服务系统」的 1:6000 万中国地图
（审图号 GS(2016)1614，自然资源部监制）。原图是彩色省图，带着
图名、图例、比例尺、经纬网和红色省名；这里只留线划，把填色、
红字、浅灰的经纬网全部丢掉，再染成一种暖金色，叠到深色板上。

用法：
    python scripts/make-map.py 原图.png
输出：
    map/china.png
"""

import sys
import os
from PIL import Image, ImageChops, ImageDraw

GOLD = (232, 200, 156)
DARK_CUT = 138      # 灰度低于它开始出现，越深越实
RED_CUT = 40        # R 比 G/B 高这么多，认作红色省名，挖掉
FRAME = (841, 661, 1554, 1364)   # 2400x2000 原图里图框的位置
LEGEND = (0, 552, 168, 703)      # 图框内的图例与比例尺，清空
NOTES = [(0, 322, 70, 376),      # 左侧「北回归线」
         (640, 322, 713, 376),   # 右侧「北回归线」
         (630, 642, 713, 692)]   # 右下「赤道」


def main(src):
    im = Image.open(src).convert('RGB')
    if im.size != (2400, 2000):
        kx = im.size[0] / 2400.0
        ky = im.size[1] / 2000.0
        box = (int(FRAME[0] * kx), int(FRAME[1] * ky),
               int(FRAME[2] * kx), int(FRAME[3] * ky))
    else:
        box = FRAME
    im = im.crop(box)

    r, g, b = im.split()
    lum = im.convert('L')

    alpha = lum.point(lambda v: max(0, min(255, int((DARK_CUT - v) * 255 / 110))))
    red = ImageChops.subtract(r, ImageChops.lighter(g, b)).point(
        lambda v: 255 if v > RED_CUT else 0)
    alpha = ImageChops.subtract(alpha, red)

    # 图例、比例尺、以及图面上的几处注记，直接擦掉
    d = ImageDraw.Draw(alpha)
    d.rectangle(LEGEND, fill=0)
    for r in NOTES:
        d.rectangle(r, fill=0)

    out = Image.new('RGBA', im.size, GOLD + (0,))
    out.putalpha(alpha)

    os.makedirs('map', exist_ok=True)
    dst = os.path.join('map', 'china.png')
    out.save(dst, optimize=True)
    print(dst, out.size, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else
         'D:/MyFiles/Gift for R/tmp/big_2400.png')
