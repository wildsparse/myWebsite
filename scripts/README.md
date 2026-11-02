# 重新生成 timeline.json

只有在**换了录音**或者**大幅改了信件正文**的时候才需要跑这一遍。
平时改几个错字不用管，差不了半秒。

## 一次性准备

```
pip install faster-whisper opencc-python-reimplemented
```

还要有 `ffmpeg`（用来把 mp3 解成 16k 单声道；Windows 上装好以后确认 `ffmpeg -version` 能跑）。
模型第一次会自动下载 small（约 480MB），之后走本地缓存。

## 四步

```
python scripts/transcribe.py small   # 整段转写，出 scripts/asr.json
python scripts/head.py               # 补测最前面那两句，出 scripts/head.json
python scripts/align.py              # 对齐，写 audio/timeline.json
python scripts/check.py              # 核对，看偏差中位数
```

`check.py` 最后一行应该是「偏差中位数 0.00 秒」。如果冒出好几处偏差超过 1.5 秒的段落，
说明那几处识别和原文对不上，去 `scripts/asr.json` 里看对应时间点识别成了什么，必要时手动改。

## 为什么不能只按总时长算

人念东西不匀速。开头往往先缓一下，中间越念越快，读到某句又会停。
原来用「当前秒数 ÷ 总时长 × 总字数」平均着推，开头就会差出一整句，越往后偏得越多。

`timeline.json` 存的是锚点：`[第几个字, 第几秒]`，385 条，5KB。
页面用二分查找在两条锚点之间插值，所以每一句都贴着真实语速走。

## 一个坑

整段丢给 whisper 时，它会把开头那两句抬头（「生日快乐，任珈萱」）当成没用的东西吞掉。
所以 `head.py` 单独把前 8 秒切出来再转一次，`align.py` 拿它的段边界直接钉在开头。
如果哪天换了录音、开头变成别的句子，改 `align.py` 里的 `HEAD_BLOCKS` 就行。

---

# 生成主屏图标

改了主屏图标的颜色或半径之后跑一句：

```
python scripts/make-icons.py
```

不用装 Pillow，脚本只用标准库自己写 PNG。会覆盖 `icons/` 里那三张：
`icon-512.png`（也当安卓的 maskable 用，内容都压在中间 80% 内）、
`icon-192.png`、`apple-touch-icon.png`（180，iOS 会自己切圆角，所以铺满不留透明）。
