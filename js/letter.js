/* ============================================================
   letter.js —— 第一幕：那封信
   打字机 + 音频 + 节奏
   ============================================================ */

const Letter = (function () {

  const $ = (id) => document.getElementById(id);

  let aborted = false;      // 用户点了"显示全文"
  let finished = false;
  let started = false;
  let audio = null;
  let audioReady = false;
  let onFinishCb = null;

  /* ---------- 打字节奏 ---------- */
  const SPEED = {
    char: 32,
    comma: 150,      // ，、；：
    stop: 380,       // 。！？
    ellipsis: 280,   // ……
    lineGap: 210,
    paraGap: 620
  };

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function delayFor(ch) {
    if ('，、；：'.includes(ch)) return SPEED.comma;
    if ('。！？'.includes(ch)) return SPEED.stop;
    if (ch === '…' || ch === '—') return SPEED.ellipsis;
    return SPEED.char;
  }

  function follow() {
    const box = $('letterScroll');
    if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 260;
    if (near) box.scrollTop = box.scrollHeight;
  }

  async function typeInto(el, text) {
    el.classList.add('is-typing');
    for (let i = 0; i < text.length; i++) {
      if (aborted) { el.textContent = text; break; }
      el.textContent += text[i];
      follow();
      await wait(delayFor(text[i]));
    }
    el.classList.remove('is-typing');
  }

  /* ---------- 结构渲染 ---------- */
  function makeLine(container, cls) {
    const div = document.createElement('div');
    div.className = 'ln';
    container.appendChild(div);
    return div;
  }

  async function run() {
    const headEl = $('letterHeading');
    const bodyEl = $('letterBody');

    /* 抬头大字 */
    for (const line of LETTER.heading) {
      const ln = makeLine(headEl);
      await typeInto(ln, line);
      await wait(420);
    }
    await wait(900);

    /* 正文 */
    for (const para of LETTER.paras) {
      const p = document.createElement('p');
      p.className = 'letter-p';
      bodyEl.appendChild(p);
      await typeInto(p, para.join(''));
      if (!aborted) await wait(SPEED.paraGap);
    }

    /* 结尾 */
    await wait(600);
    const closingEl = $('letterClosing');
    for (const line of LETTER.closing) {
      const ln = makeLine(closingEl);
      await typeInto(ln, line);
      if (!aborted) await wait(520);
    }

    /* 落款 */
    await wait(700);
    const signEl = $('letterSign');
    signEl.innerHTML = '';
    const s1 = document.createElement('div');
    signEl.appendChild(s1);
    await typeInto(s1, '—— ' + LETTER.sign);

    const s2 = document.createElement('div');
    s2.style.cssText = 'font-size:.82em;opacity:0;margin-top:.5rem;transition:opacity 1.4s ease';
    s2.textContent = LETTER.signDate;
    signEl.appendChild(s2);
    requestAnimationFrame(() => { s2.style.opacity = '.7'; });
    await wait(900);

    finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    $('skipBtn').style.display = 'none';
    const nx = $('toIntro');
    if (nx) nx.hidden = false;

    // 收尾时把视线带到落款
    const box = $('letterScroll');
    if (box) setTimeout(() => box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }), 260);

    if (onFinishCb) onFinishCb();
  }

  /* ---------- 音频 ---------- */
  function initAudio() {
    audio = new Audio();
    audio.src = AUDIO.src;
    audio.preload = 'metadata';
    audio.loop = false;

    const btn = $('audioBtn');
    const label = $('audioLabel');
    if (label) label.textContent = AUDIO.label;

    audio.addEventListener('canplaythrough', () => { audioReady = true; }, { once: true });
    audio.addEventListener('loadedmetadata', () => { audioReady = true; }, { once: true });

    audio.addEventListener('error', () => {
      audioReady = false;
      btn.style.display = 'none';      // 没放音频就不显示播放器，不打扰
    });

    audio.addEventListener('ended', () => btn.classList.remove('is-playing'));

    btn.addEventListener('click', async () => {
      if (!audioReady) { toast('音频还没放进来'); return; }
      if (audio.paused) {
        try { await audio.play(); btn.classList.add('is-playing'); }
        catch { toast('播放被挡住了，再点一次'); }
      } else {
        audio.pause();
        btn.classList.remove('is-playing');
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
  function begin() {
    if (started) return;
    started = true;

    $('overture').classList.add('is-out');
    $('letterInner').classList.add('is-visible');
    $('letterBar').classList.add('is-on');

    // 有音频就跟着一起开始（用户手势触发的，不会被拦）
    if (audio && audioReady) {
      audio.play().then(() => $('audioBtn').classList.add('is-playing')).catch(() => { });
    }

    setTimeout(run, 900);
  }

  function skip() {
    if (finished) return;
    aborted = true;
    $('skipBtn').textContent = '已全部展开';
    setTimeout(finish, 300);
  }

  function init(onFinish) {
    onFinishCb = onFinish;

    $('overtureTo').textContent = LETTER.to;
    initAudio();

    $('overtureHint').addEventListener('click', begin);
    $('overture').addEventListener('click', (e) => {
      if (e.target.id === 'overture' || e.target.id === 'overtureTo') begin();
    });
    $('skipBtn').addEventListener('click', skip);

    // 空格 / 回车也能开始、跳过
    document.addEventListener('keydown', (e) => {
      if (!started && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); begin(); }
      else if (started && !finished && e.key === 'Escape') skip();
    });

    return { begin, skip };
  }

  return { init, begin };
})();
