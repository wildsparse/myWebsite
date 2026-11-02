# -*- coding: utf-8 -*-
"""补测开头：整段转写时 whisper 会把最前面那句抬头吞掉，
所以单独切出前 8 秒再转一次，只取两句话的起止时间。"""
import json
import os
import wave
import numpy as np
from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # → 仓库根目录
WAV = ROOT + "/scripts/.letter16k.wav"
OUT = ROOT + "/scripts/head.json"

with wave.open(WAV, "rb") as w:
    sr = w.getframerate()
    raw = w.readframes(int(sr * 8.2))
a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

m = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=8)
segs, _ = m.transcribe(a, language="zh", beam_size=5, vad_filter=False,
                       condition_on_previous_text=False, word_timestamps=True,
                       initial_prompt="生日祝福。")
out = []
for s in segs:
    out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()})
    print(f"[{s.start:5.2f}-{s.end:5.2f}] {s.text.strip()}")
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved", OUT)
