# -*- coding: utf-8 -*-
"""把 letter.mp3 转成带时间戳的分段文本，供对齐用。
本机 PyAV 版本与 faster-whisper 不兼容，所以先用 ffmpeg 解成 16k 单声道 wav 再喂给模型。"""
import json, sys, os, wave, subprocess
import numpy as np
from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # → 仓库根目录
AUD = ROOT + "/audio/letter.mp3"
WAV = ROOT + "/scripts/.letter16k.wav"
OUT = ROOT + "/scripts/asr.json"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
SIZE = sys.argv[1] if len(sys.argv) > 1 else "small"

# 不要把正文放进提示词：模型会误以为这段已经说过，把开头整段吞掉
PROMPT = "以下是普通话的朗读。"


def load_wav():
    if not os.path.exists(WAV):
        subprocess.run([FFMPEG, "-y", "-i", AUD, "-ac", "1", "-ar", "16000",
                        "-c:a", "pcm_s16le", WAV], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with wave.open(WAV, "rb") as w:
        n = w.getnframes()
        raw = w.readframes(n)
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def main():
    audio = load_wav()
    print("samples", len(audio), "sec", len(audio) / 16000, flush=True)
    print("loading", SIZE, flush=True)
    model = WhisperModel(SIZE, device="cpu", compute_type="int8", cpu_threads=8)
    print("transcribing", flush=True)
    segs, info = model.transcribe(
        audio,
        language="zh",
        beam_size=5,
        initial_prompt=PROMPT,
        condition_on_previous_text=False,
        vad_filter=False,
        word_timestamps=True,
    )
    out = []
    for s in segs:
        words = [{"w": round(w.start, 2), "e": round(w.end, 2), "t": w.word}
                 for w in (s.words or [])]
        out.append({"start": round(s.start, 2), "end": round(s.end, 2),
                    "text": s.text.strip(), "words": words})
        print(f"[{s.start:7.2f} - {s.end:7.2f}] {s.text.strip()}", flush=True)
    print("duration", info.duration, flush=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"duration": info.duration, "segments": out}, f, ensure_ascii=False, indent=1)
    print("saved", OUT, flush=True)


main()
