/* ============================================================
   letter.js —— 第一幕：那封信
   两种节奏：
     有声音 → 文字跟着声音走（暂停即停，拖回去也跟着退）
     没声音 → 按打字机速度慢慢出字
   ============================================================ */

const Letter = (function () {

  const $ = (id) => document.getElementById(id);

  const WAIT_MS = 9000;      // 最多等多久让声音起来
  const HINT_DELAY = 700;    // 等超过这么久，才提示「声音正在赶来」

  let aborted = false;
  let finished = false;
  let started = false;

  let blocks = [];          // { el, text, start, typed }
  let flat = '';            // 全文拼接，用来判断标点
  let total = 0;

  let mode = null;          // 'audio' | 'auto'
  let timer = null;
  let rafId = null;

  let audio = null;
  let audioBroken = false;

  /* ---------- 时间轴 ----------
     audio/timeline.json 是用语音识别量出来的：原文第几个字，出现在第几秒。
     有它以后，文字就不按"平均语速"推，而是按朗读的真实位置推。
     文件没加载到（断网、还没传）就退回平均速度，不至于不出字。 */
  let anchors = null;
  let anchorDead = false;
  let anchorTried = false;

  function loadTimeline() {
    if (anchorTried) return;
    anchorTried = true;
    // 万一下不来，四秒后就不再等它，按平均语速走
    const giveUp = setTimeout(() => { if (!anchors) anchorDead = true; }, 4000);
    fetch('audio/timeline.json')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d && d.a && d.a.length > 2) anchors = d.a;
        else anchorDead = true;
      })
      .catch(() => { anchorDead = true; })
      .finally(() => clearTimeout(giveUp));
  }

  // 第 t 秒 → 该显示到第几个字
  function charsAt(t) {
    const d = durationOf();
    if (!anchors) return d > 0 ? Math.floor(Math.min(1, Math.max(0, t / d)) * total) : 0;

    const n = anchors.length;
    if (t <= anchors[0][1]) return anchors[0][0];
    if (t >= anchors[n - 1][1]) return total;

    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid][1] <= t) lo = mid; else hi = mid;
    }
    const i0 = anchors[lo][0], t0 = anchors[lo][1];
    const i1 = anchors[hi][0], t1 = anchors[hi][1];
    const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return Math.round(i0 + (i1 - i0) * k);
  }

  // 第 T 个字 → 它被念到的秒数（点"听声音"时把声音接到文字现在的位置）
  function timeAt(T) {
    const d = durationOf();
    if (!anchors) return total > 0 ? (T / total) * d : 0;

    const n = anchors.length;
    if (T <= anchors[0][0]) return anchors[0][1];
    if (T >= anchors[n - 1][0]) return anchors[n - 1][1];

    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid][0] <= T) lo = mid; else hi = mid;
    }
    const i0 = anchors[lo][0], t0 = anchors[lo][1];
    const i1 = anchors[hi][0], t1 = anchors[hi][1];
    const k = i1 > i0 ? (T - i0) / (i1 - i0) : 0;
    return t0 + (t1 - t0) * k;
  }

  /* ---------- 节奏（没有声音时用） ---------- */
  const SPEED = {
    char: 60,          // 每个字的间隔
    comma: 240,        // ，、；：
    stop: 560,         // 。！？
    ellipsis: 420,     // ……
    paraGap: 900       // 段落之间额外停一下
  };

  const CHAR_COMMA = '，、；：';
  const CHAR_STOP = '。！？';
  const CHAR_ELLIP = '…—';

  /* ---------- 结构 ---------- */
  function build() {
    const headEl = $('letterHeading');
    const bodyEl = $('letterBody');
    const closingEl = $('letterClosing');
    const signEl = $('letterSign');

    [headEl, bodyEl, closingEl, signEl].forEach(n => { n.innerHTML = ''; });
    blocks = [];
    total = 0;

    const add = (el, text) => {
      el.textContent = '';
      blocks.push({ el, text, start: total, typed: -1 });
      total += text.length;
    };

    LETTER.heading.forEach(t => {
      const ln = document.createElement('div');
      ln.className = 'ln';
      headEl.appendChild(ln);
      add(ln, t);
    });

    LETTER.paras.forEach(para => {
      const p = document.createElement('p');
      p.className = 'letter-p';
      bodyEl.appendChild(p);
      add(p, para.join(''));
    });

    LETTER.closing.forEach(t => {
      const ln = document.createElement('div');
      ln.className = 'ln';
      closingEl.appendChild(ln);
      add(ln, t);
    });

    const s1 = document.createElement('div');
    signEl.appendChild(s1);
    add(s1, '—— ' + LETTER.sign);

    const s2 = document.createElement('div');
    s2.className = 'sign-date';
    s2.textContent = LETTER.signDate;
    s2.style.opacity = '0';
    s2.style.transition = 'opacity 1.6s ease';
    signEl.appendChild(s2);

    flat = blocks.map(b => b.text).join('');
  }

  /* ---------- 揭示到第 T 个字 ---------- */
  function reveal(T) {
    let changed = false;
    for (const b of blocks) {
      const need = Math.max(0, Math.min(b.text.length, T - b.start));
      if (need !== b.typed) {
        b.el.textContent = b.text.slice(0, need);
        b.typed = need;
        changed = true;
      }
    }
    if (changed) {
      for (const b of blocks) {
        const mid = b.typed > 0 && b.typed < b.text.length;
        b.el.classList.toggle('is-typing', mid);
      }
      follow();
    }
  }

  function revealAll() {
    reveal(total);
    const date = document.querySelector('.sign-date');
    if (date) date.style.opacity = '.7';
  }

  function shownChars() {
    let n = 0;
    for (const b of blocks) n += Math.max(0, b.typed);
    return n;
  }

  let followUp = true;        // 人往上翻信的时候，就别再抢滚动条

  function follow() {
    const box = $('letterScroll');
    if (!box || !followUp) return;
    box.scrollTop = box.scrollHeight;
  }

  /* ---------- 逐字节奏 ---------- */
  function blockAt(T) {
    for (const b of blocks) {
      if (T <= b.start + b.text.length) return b;
    }
    return blocks[blocks.length - 1];
  }

  function delayAt(T) {
    const ch = flat[T - 1] || '';
    let d = SPEED.char;
    if (CHAR_COMMA.includes(ch)) d = SPEED.comma;
    else if (CHAR_STOP.includes(ch)) d = SPEED.stop;
    else if (CHAR_ELLIP.includes(ch)) d = SPEED.ellipsis;

    const b = blockAt(T);
    if (b && T === b.start + b.text.length) d += SPEED.paraGap;
    return d;
  }

  /* ---------- 模式一：自己走 ---------- */
  function startAuto() {
    if (mode === 'auto') return;
    mode = 'auto';
    stopLoops();
    let T = shownChars();
    const tick = () => {
      if (finished) return;
      if (aborted) { revealAll(); finish(); return; }
      if (T >= total) { revealAll(); finish(); return; }
      T++;
      reveal(T);
      timer = setTimeout(tick, delayAt(T));
    };
    tick();
  }

  /* ---------- 模式二：跟着声音 ---------- */
  function durationOf() {
    if (audio) {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) return d;
    }
    return AUDIO.duration || 0;
  }

  function startAudioSync() {
    if (mode === 'audio') return;
    mode = 'audio';
    stopLoops();

    const step = () => {
      if (finished) return;
      if (aborted) { revealAll(); finish(); return; }

      // 时间轴还在路上，先等它一下，别按错误的节奏往前跳
      if (!anchors && !anchorDead) {
        rafId = requestAnimationFrame(step);
        return;
      }

      const d = durationOf();
      if (d > 0) {
        reveal(charsAt(audio.currentTime));
      }

      if (audio.ended) { revealAll(); finish(); return; }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  function stopLoops() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ---------- 收尾 ---------- */
  function finish() {
    if (finished) return;
    finished = true;
    stopLoops();

    $('skipBtn').style.display = 'none';
    const nx = $('toIntro');
    if (nx) nx.hidden = false;

    const box = $('letterScroll');
    if (box) setTimeout(() => box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }), 260);
  }

  function skip() {
    if (finished) return;
    aborted = true;
    stopLoops();
    if (audio && !audio.paused) audio.pause();
    revealAll();
    $('skipBtn').textContent = '已全部展开';
    setTimeout(finish, 320);
  }

  /* ---------- 提示 ---------- */
  function showWait(on) {
    const el = $('letterWait');
    if (el) el.classList.toggle('is-on', !!on);
  }

  function setBtnLabel(text) {
    const l = $('audioLabel');
    if (l) l.textContent = text;
  }

  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('is-on'), 2400);
  }

  /* ---------- 声音 ---------- */
  function initAudio() {
    audio = new Audio();
    audio.preload = 'none';        // 先不下，别抢首屏的带宽
    audio.src = AUDIO.src;

    setBtnLabel(AUDIO.label);

    // 页面自己的东西下完了，再偷偷把声音拉下来，等用户点的时候就不卡
    const warm = () => {
      try { audio.preload = 'auto'; audio.load(); } catch (_) {}
    };
    if (document.readyState === 'complete') setTimeout(warm, 400);
    else window.addEventListener('load', () => setTimeout(warm, 400), { once: true });

    audio.addEventListener('error', () => {
      audioBroken = true;
      const btn = $('audioBtn');
      if (btn) btn.style.display = 'none';
    });

    audio.addEventListener('ended', () => {
      $('audioBtn').classList.remove('is-playing');
      setBtnLabel('再听一遍');
    });

    audio.addEventListener('pause', () => {
      $('audioBtn').classList.remove('is-playing');
      if (!finished && !audio.ended) setBtnLabel('继续听');
    });

    audio.addEventListener('play', () => {
      $('audioBtn').classList.add('is-playing');
      setBtnLabel(AUDIO.label);
    });

    $('audioBtn').addEventListener('click', async () => {
      if (audioBroken) { toast('声音没加载出来，刷新一下试试'); return; }

      // 已经读完：从头再来一遍
      if (finished) { restart(); return; }

      if (audio.paused) {
        // 文字若已按打字机走了一段，把声音接到那个位置，不让人重听
        if (mode !== 'audio') {
          const T = shownChars();
          if (T > 0) {
            try { audio.currentTime = timeAt(T); } catch (_) {}
          }
        }
        try {
          await audio.play();
        } catch (_) {
          toast('播放被挡住了，再点一次');
          return;
        }
        startAudioSync();
      } else {
        audio.pause();
      }
    });
  }

  /* 等声音真正响起来。play() 必须在这里同步发出，才算在用户手势里。 */
  function waitPlaying(ms) {
    const btn = $('audioBtn');
    if (btn) btn.classList.add('is-waiting');

    return new Promise((resolve) => {
      let done = false;
      let hintTimer = setTimeout(() => showWait(true), HINT_DELAY);
      let clock = setTimeout(() => { finishWait(false); }, ms);

      function finishWait(v) {
        if (done) return;
        done = true;
        clearTimeout(hintTimer);
        clearTimeout(clock);
        showWait(false);
        if (btn) btn.classList.remove('is-waiting');
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('error', onError);
        resolve(v);
      }
      function onPlaying() { finishWait(true); }
      function onError() { audioBroken = true; finishWait(false); }

      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('error', onError);

      // 同步发起，保住浏览器的自动播放许可
      const p = audio.play();
      if (p && p.catch) p.catch(() => finishWait(false));
    });
  }

  /* ---------- 从头再来 ---------- */
  function restart() {
    stopLoops();
    finished = false;
    aborted = false;
    mode = null;
    started = true;

    build();
    reveal(0);

    const nx = $('toIntro');
    if (nx) nx.hidden = true;
    const sb = $('skipBtn');
    if (sb) { sb.style.display = ''; sb.textContent = '显示全文'; }

    try { audio.currentTime = 0; } catch (_) {}

    audio.play().then(() => startAudioSync()).catch(() => startAuto());
  }

  /* ---------- 开场 ---------- */
  function begin() {
    if (started) return;
    started = true;

    $('overture').classList.add('is-out');
    $('letterInner').classList.add('is-visible');
    $('letterBar').classList.add('is-on');

    build();
    reveal(0);

    if (!audio || audioBroken) { startAuto(); return; }

    waitPlaying(WAIT_MS).then((ready) => {
      if (ready) {
        startAudioSync();
      } else {
        // 声音没能起来：先按打字机走，之后点按钮可以接管
        if (audio && !audio.paused) startAudioSync();
        else { setBtnLabel('点这里听声音'); startAuto(); }
      }
    });
  }

  function init() {
    $('overtureTo').textContent = LETTER.to;
    initAudio();
    loadTimeline();

    $('overtureHint').addEventListener('click', begin);
    $('overture').addEventListener('click', (e) => {
      if (e.target.id === 'overture' || e.target.id === 'overtureTo') begin();
    });
    $('skipBtn').addEventListener('click', skip);

    const box = $('letterScroll');
    if (box) {
      box.addEventListener('scroll', () => {
        followUp = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!started && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); begin(); }
      else if (started && !finished && e.key === 'Escape') skip();
    });
  }

  /* 调试用：?debug=1 时可以从控制台看进度 */
  function state() {
    return {
      mode,
      total,
      shown: shownChars(),
      t: audio ? Math.round(audio.currentTime * 100) / 100 : 0,
      d: Math.round(durationOf() * 10) / 10,
      anchors: anchors ? anchors.length : (anchorDead ? 'none' : 'loading'),
      paused: audio ? audio.paused : true,
      ended: audio ? audio.ended : false
    };
  }
  if (/[?&]debug=1/.test(location.search)) {
    window.__letterState = state;
    window.__letterAudio = () => audio;
  }

  return { init, begin, skip, state };
})();
