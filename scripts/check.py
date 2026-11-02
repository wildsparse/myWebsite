# -*- coding: utf-8 -*-
"""交叉核对：拿语音识别里的原始时间，和生成的时间轴比一比。
两边是同一份录音、但一条来自识别器的词级时间、一条来自我抽稀后的插值，
差得开就说明某处对错了。"""
import json, os, subprocess
from opencc import OpenCC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # → 仓库根目录
CC = OpenCC("t2s")
_c = {}


def is_kept(ch):
    return ("\u4e00" <= ch <= "\u9fff") or ("a" <= ch.lower() <= "z") or ch.isdigit()


def norm(s):
    o = []
    for ch in s:
        c = _c.get(ch) or CC.convert(ch)
        _c[ch] = c
        for x in c:
            if is_kept(x):
                o.append(x.lower())
    return o


def blocks():
    js = r"""
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(process.argv[1],'utf8');
const ctx=vm.createContext({});
vm.runInContext(src+'\n;globalThis.__L=LETTER;',ctx);
const L=ctx.__L,b=[];
L.heading.forEach(t=>b.push(t));
L.paras.forEach(p=>b.push(p.join('')));
L.closing.forEach(t=>b.push(t));
b.push('—— '+L.sign);
process.stdout.write(JSON.stringify(b));
"""
    p = subprocess.run(["node", "-e", js, ROOT + "/js/config.js"], capture_output=True)
    return json.loads(p.stdout.decode("utf-8"))


def at_char(anchors, T):
    """第 T 个字 → 秒。注意和前端 timeAt() 是同一套逻辑。"""
    if T <= anchors[0][0]:
        return anchors[0][1]
    if T >= anchors[-1][0]:
        return anchors[-1][1]
    lo, hi = 0, len(anchors) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if anchors[m][0] <= T:
            lo = m
        else:
            hi = m
    i0, t0 = anchors[lo]
    i1, t1 = anchors[hi]
    return t0 + (t1 - t0) * ((T - i0) / (i1 - i0) if i1 > i0 else 0)


def main():
    tl = json.load(open(ROOT + "/audio/timeline.json", encoding="utf-8"))
    anchors = tl["a"]
    asr = json.load(open(ROOT + "/scripts/asr.json", encoding="utf-8"))
    s, ts = [], []
    for seg in asr["segments"]:
        for w in seg.get("words") or []:
            chs = norm(w["t"])
            d = max(0.05, w["e"] - w["w"])
            for k, c in enumerate(chs):
                s.append(c)
                ts.append(w["w"] + d * (k + 0.5) / len(chs))
    s = "".join(s)

    bl = blocks()
    g = 0
    rows = []
    for b in bl:
        head = "".join(norm(b))
        probe = head[:8]
        pos = -1
        while len(probe) >= 4:
            pos = s.find(probe)
            if pos >= 0:
                break
            probe = probe[:-1]
        if pos >= 0:
            diff = ts[pos] - at_char(anchors, g)
            rows.append((abs(diff), diff, g, ts[pos], at_char(anchors, g), b[:16]))
        g += len(b)

    rows.sort(reverse=True)
    print(f"{'差':>7}  {'识别':>8}  {'时间轴':>8}  段首")
    for a, d, g, ta, tt, txt in rows[:10]:
        print(f"{d:+7.2f}  {ta:8.2f}  {tt:8.2f}  {txt}")
    big = [r for r in rows if r[0] > 1.5]
    print(f"\n段落 {len(rows)} 处可核，偏差 >1.5 秒的 {len(big)} 处")
    med = sorted(r[0] for r in rows)[len(rows) // 2]
    print(f"偏差中位数 {med:.2f} 秒")


main()
