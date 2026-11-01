/* ============================================================
   letter.js —— 第一幕：那封信
   两种节奏：
     有音频 → 文字跟着音频进度走（暂停即停，拖回去也跟着退）
     没音频 → 按打字机速度慢慢出字
   ============================================================ */

const Letter = (function () {

  const $ = (id) => document.getElementById(id);

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
  let audioReady = false;

  /* ---------- 节奏 ---------- */
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

  function follow() {
    const box = $('letterScroll');
    if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 300;
    if (near) box.scrollTop = box.scrollHeight;
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
    mode = 'auto';
    let T = 0;
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

  /* ---------- 模式二：跟着音频 ---------- */
  function startAudioSync() {
    mode = 'audio';
    const step = () => {
      if (finished) return;
      if (aborted) { revealAll(); finish(); return; }

      const dur = audio.duration;
      if (dur && isFinite(dur) && dur > 0) {
        const p = Math.min(1, audio.currentTime / dur);
        reveal(Math.floor(p * total));
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
    revealAll();
    $('skipBtn').textContent = '已全部展开';
    setTimeout(finish, 320);
  }

  /* ---------- 音频 ---------- */
  function initAudio() {
    audio = new Audio();
    audio.src = AUDIO.src;
    audio.preload = 'metadata';

    const btn = $('audioBtn');
    const label = $('audioLabel');
    if (label) label.textContent = AUDIO.label;

    const markReady = () => { audioReady = true; };
    audio.addEventListener('loadedmetadata', markReady, { once: true });
    audio.addEventListener('canplaythrough', markReady, { once: true });

    audio.addEventListener('error', () => {
      audioReady = false;
      btn.style.display = 'none';
    });

    audio.addEventListener('ended', () => btn.classList.remove('is-playing'));
    audio.addEventListener('pause', () => btn.classList.remove('is-playing'));
    audio.addEventListener('play', () => btn.classList.add('is-playing'));

    btn.addEventListener('click', async () => {
      if (!audioReady) { toast('音频还没放进来'); return; }
      if (audio.paused) {
        try { await audio.play(); } catch { toast('播放被挡住了，再点一次'); }
      } else {
        audio.pause();
      }
    });
  }

  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  /* ---------- 开场 ---------- */
  async function begin() {
    if (started) return;
    started = true;

    $('overture').classList.add('is-out');
    $('letterInner').classList.add('is-visible');
    $('letterBar').classList.add('is-on');

    build();

    if (audio && audioReady) {
      try {
        await audio.play();
        startAudioSync();
        return;
      } catch {
        // 自动播放被挡，退回自己走
      }
    }
    startAuto();
  }

  function init() {
    $('overtureTo').textContent = LETTER.to;
    initAudio();

    $('overtureHint').addEventListener('click', begin);
    $('overture').addEventListener('click', (e) => {
      if (e.target.id === 'overture' || e.target.id === 'overtureTo') begin();
    });
    $('skipBtn').addEventListener('click', skip);

    document.addEventListener('keydown', (e) => {
      if (!started && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); begin(); }
      else if (started && !finished && e.key === 'Escape') skip();
    });
  }

  return { init, begin, skip };
})();
