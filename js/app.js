/* ============================================================
   app.js —— 把三幕串起来
   ============================================================ */

(function () {

  const $ = (id) => document.getElementById(id);
  let holeReady = false;

  function showAct(id) {
    document.querySelectorAll('.act').forEach(a => {
      a.classList.toggle('is-active', a.id === id);
    });
    document.body.classList.toggle('is-hole', id === 'act-hole');
    if (id === 'act-hole') {
      $('act-hole').scrollTop = 0;
    }
  }

  function renderIntro() {
    $('introKicker').textContent = INTRO.kicker;
    $('introTitle').textContent = INTRO.title;
    const box = $('introLines');
    box.innerHTML = '';
    INTRO.lines.forEach(t => {
      const p = document.createElement('p');
      p.textContent = t;
      box.appendChild(p);
    });
    $('toHole').textContent = INTRO.button;
  }

  function boot() {
    Letter.init(() => { /* 信读完了 */ });

    /* 介绍页的文字推迟渲染：
       它会触发一大批字体分片的下载，放在开场画面之后做，
       首屏就只需要加载开场那几个字的字重。 */
    let introReady = false;
    function ensureIntro() {
      if (introReady) return;
      introReady = true;
      renderIntro();
    }
    setTimeout(ensureIntro, 2200);

    $('toIntro').addEventListener('click', () => {
      ensureIntro();
      showAct('act-intro');
      window.scrollTo(0, 0);
    });

    $('toHole').addEventListener('click', () => {
      showAct('act-hole');
      if (!holeReady) {
        holeReady = true;
        Hole.init();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 调试用：?act=intro / ?act=hole 可以直接跳到某一幕；?fast=1 打字加速 */
  window.addEventListener('load', () => {
    const q = new URLSearchParams(location.search);
    const act = q.get('act');
    if (act === 'intro') showAct('act-intro');
    if (act === 'hole') {
      showAct('act-hole');
      if (!holeReady) { holeReady = true; Hole.init(); }
    }
    if (q.get('fast')) window.__FAST__ = true;
  });
})();
