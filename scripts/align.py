# -*- coding: utf-8 -*-
"""把 ASR 结果对齐到信件的原文，产出「第几个字 ≈ 第几秒」的锚点表。
做法：两侧都归一化成纯汉字/字母/数字序列，用最长公共子序列对齐，
认出同一个字就给一条时间线证据，再把密集的证据抽稀成锚点。"""
import json, os, subprocess, sys
from difflib import SequenceMatcher
from opencc import OpenCC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # → 仓库根目录
ASR = ROOT + "/scripts/asr.json"
OUT = ROOT + "/audio/timeline.json"
CC = OpenCC("t2s")

_cache = {}


def is_kept(ch):
    return ("\u4e00" <= ch <= "\u9fff") or ("a" <= ch.lower() <= "z") or ch.isdigit()


def norm(s):
    """繁转简 + 只留实体字，返回字符列表。"""
    out = []
    for ch in s:
        c = _cache.get(ch)
        if c is None:
            c = CC.convert(ch)
            _cache[ch] = c
        for x in c:
            if is_kept(x):
                out.append(x.lower())
    return out


def letter_blocks():
    """按 letter.js 里 build() 的规则拼出文字块。"""
    script = r"""
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
    p = subprocess.run(["node", "-e", script, ROOT + "/js/config.js"],
                       capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr.decode("utf-8", "ignore"))
    return json.loads(p.stdout.decode("utf-8"))


def main():
    blocks = letter_blocks()
    target, tidx, bounds = [], [], []
    g = 0
    for bi, b in enumerate(blocks):
        bounds.append(g)
        for ch in b:
            n = norm(ch)
            for x in n:
                target.append(x)
                tidx.append(g)
            g += 1
    total = g

    asr = json.load(open(ASR, encoding="utf-8"))
    achar, atime = [], []
    for seg in asr["segments"]:
        for w in seg.get("words") or []:
            chs = norm(w["t"])
            if not chs:
                continue
            d = max(0.05, w["e"] - w["w"])
            for k, c in enumerate(chs):
                achar.append(c)
                atime.append(w["w"] + d * (k + 0.5) / len(chs))

    print(f"target {len(target)} chars / asr {len(achar)} chars")

    sm = SequenceMatcher(None, achar, target, autojunk=False)
    amap = {}
    hit = 0
    for a, b, size in sm.get_matching_blocks():
        hit += size
        for k in range(size):
            amap[tidx[b + k]] = atime[a + k]
    print(f"matched {hit}/{len(target)} = {hit/len(target)*100:.1f}%")

    # 开头两句由 head.py 单独测过，直接钉进去（整段转写会漏掉抬头）
    head = json.load(open(ROOT + "/scripts/head.json", encoding="utf-8"))
    HEAD_BLOCKS = [0, 1]
    for bi, seg in zip(HEAD_BLOCKS, head):
        st = bounds[bi]
        en = st + len(blocks[bi]) - 1
        amap[st] = seg["start"]
        amap[en] = seg["end"]
        print(f"  钉住 block{bi}: {st}->{seg['start']}s, {en}->{seg['end']}s")

    # 单调化（顺带丢掉时间上打架的点）
    monotone, last = [], -1e9
    for i in sorted(amap):
        t = amap[i]
        if t > last:
            monotone.append((i, t))
            last = t
    print(f"monotone {len(monotone)} points")

    # 抽稀：每 5 个字留一个，段落起点必留
    keep, lasti = [], -99
    bset = set(bounds)
    for i, t in monotone:
        if i in bset or i - lasti >= 5:
            keep.append([i, round(t, 2)])
            lasti = i
    keep.append([total, round(asr["duration"], 2)])

    # 段落起点若没落到锚点上，用左右锚点插值补一条
    have = {i for i, _ in keep}
    for st in bounds:
        if st in have or st == total:
            continue
        for k in range(1, len(keep)):
            if keep[k][0] > st:
                i0, t0 = keep[k - 1]
                i1, t1 = keep[k]
                keep.insert(k, [st, round(t0 + (t1 - t0) * (st - i0) / (i1 - i0), 2)])
                have.add(st)
                break

    # 诊断：每段的首字落在第几秒
    pos = {i: t for i, t in keep}
    print("\n每段起点：")
    for bi, st in enumerate(bounds):
        head = blocks[bi][:14]
        print(f"  {st:5d}  {pos.get(st, float('nan')):8.2f}s  {head}")

    data = {"d": round(asr["duration"], 2), "total": total, "a": keep}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nsaved {OUT}  anchors={len(keep)}")


main()
