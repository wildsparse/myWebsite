/* ============================================================
   hole.js —— 第三幕：树洞（回忆 / 留言 / 一起做清单）
   ============================================================ */

const Hole = (function () {

  const $ = (id) => document.getElementById(id);

  let memItems = [];
  let msgItems = [];
  let todoItems = [];
  let currentPane = 'memories';
  let memView = 'grid';                 // 'grid' | 'timeline'
  let pendingMemAuthor = HOLE.authors[0];
  let msgAuthor = HOLE.authors[0];
  let todoAuthor = HOLE.authors[0];

  /* ---------- 小工具 ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 手机上点 div 常有「点一下没反应」的情况：iOS 上带 :hover 效果的元素，
     第一次触摸只把它当成悬停，不肯派发 click。这里自己认「按下—抬起」
     这一次手势，和 click 互相去重，两种内核都能打开。 */
  function onTap(node, fn, skipSel) {
    const skip = skipSel === undefined ? 'button, a, input, label' : skipSel;
    let last = 0;
    const fire = (e) => {
      const hit = e.target;
      if (skip && hit && hit.closest && hit.closest(skip)) return;
      const now = Date.now();
      if (now - last < 600) return;
      last = now;
      fn(e);
    };

    let x0 = 0, y0 = 0, t0 = 0, moved = false;
    node.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (!t) return;
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); moved = false;
    }, { passive: true });
    node.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - x0) > 16 || Math.abs(t.clientY - y0) > 16) moved = true;
    }, { passive: true });
    node.addEventListener('touchend', (e) => {
      if (moved || Date.now() - t0 > 800) return;   // 滑动页面不算点
      fire(e);
    }, { passive: true });

    node.addEventListener('click', fire);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return fmtDate(iso) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fmtToday() {
    const d = new Date();
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('is-on'), 2400);
  }

  function openModal(id) { $(id).classList.add('is-on'); }
  function closeModal(id) { $(id).classList.remove('is-on'); }

  /* ---------- 评论 ---------- */
  let commentCounts = {};              // 'memory:5' → 3
  let cmtAuthor = HOLE.authors[0];

  const cmtKey = (type, id) => type + ':' + String(id);
  const cmtN = (type, id) => commentCounts[cmtKey(type, id)] || 0;

  /* 「3 条评论」这个小标签，卡片上、浮层里都用它 */
  function countTag(type, id) {
    const n = cmtN(type, id);
    const s = el('span', 'cmt-count' + (n ? ' has' : ''), n ? n + ' ' + HOLE.commentWord : HOLE.commentNone);
    s.dataset.type = type;
    s.dataset.id = String(id);
    return s;
  }

  /* 发完 / 删完把页面上所有标签改一遍，不用重画整个列表 */
  function refreshCounts() {
    document.querySelectorAll('.cmt-count').forEach((s) => {
      const n = cmtN(s.dataset.type, s.dataset.id);
      s.textContent = n ? n + ' ' + HOLE.commentWord : HOLE.commentNone;
      s.classList.toggle('has', n > 0);
    });
  }

  /* 刚发的写「刚刚」，久一点的写日期 */
  function fmtWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const sec = Math.floor((now - d) / 1000);
    if (sec < 60) return HOLE.commentTimeJustNow;
    if (sec < 3600) return Math.floor(sec / 60) + ' ' + HOLE.commentTimeMinutes;
    if (sec < 86400) return Math.floor(sec / 3600) + ' ' + HOLE.commentTimeHours;
    const p = (n) => String(n).padStart(2, '0');
    const head = d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '.';
    return head + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function commentRow(c, onDel) {
    const item = el('div', 'cmt-item');
    const head = el('div', 'cmt-head');
    head.appendChild(el('span', 'cmt-author', c.author || '匿名'));
    head.appendChild(el('span', 'cmt-time', fmtWhen(c.created_at)));

    const del = el('button', 'cmt-del', '×');
    del.type = 'button';
    del.title = '删掉这条评论';
    del.addEventListener('click', () => onDel(c));
    head.appendChild(del);

    item.append(head, el('div', 'cmt-text', c.text));
    return item;
  }

  /* 一条回忆 / 一条留言下面的评论区：几行评论 + 写一句的地方 */
  function commentBox(type, id) {
    const box = el('div', 'cmt-box');
    const list = el('div', 'cmt-list');
    const form = el('div', 'cmt-form');
    const chips = el('div', 'cmt-chips');

    const input = document.createElement('input');
    input.className = 'cmt-input';
    input.type = 'text';
    input.maxLength = 200;
    input.placeholder = HOLE.commentPlaceholder;

    const send = el('button', 'cmt-send', HOLE.commentSend);
    send.type = 'button';

    buildChips(chips, HOLE.authors, (n) => { cmtAuthor = n; }, cmtAuthor);
    form.append(chips, input, send);

    let items = [];

    function paint() {
      list.innerHTML = '';
      if (!items.length) {
        list.appendChild(el('div', 'cmt-empty', HOLE.commentEmpty));
        return;
      }
      items.forEach((c) => list.appendChild(commentRow(c, remove)));
      list.scrollTop = list.scrollHeight;
    }

    async function remove(c) {
      if (!confirm('删掉这条评论？')) return;
      if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }
      try {
        await API.delComment(c.id);
        items = items.filter((x) => String(x.id) !== String(c.id));
        commentCounts[cmtKey(type, id)] = Math.max(0, cmtN(type, id) - 1);
        paint();
        refreshCounts();
      } catch (e) {
        toast(e.message === 'KEY' ? HOLE.keyWrong : '没删掉，等下再试');
      }
    }

    async function submit() {
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }

      send.disabled = true;
      try {
        const item = await API.addComment({
          target_type: type,
          target_id: String(id),
          author: cmtAuthor,
          text: text
        });
        items.push(item);
        input.value = '';
        paint();
        commentCounts[cmtKey(type, id)] = cmtN(type, id) + 1;
        refreshCounts();
      } catch (e) {
        toast(e.message === 'KEY' ? HOLE.keyWrong : '没发出去，等下再试');
      }
      send.disabled = false;
    }

    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    box.append(list, form);

    API.listComments(type, id)
      .then((rows) => { items = rows || []; paint(); })
      .catch(() => paint());

    return box;
  }

  /* ---------- 卡片取景 ---------- */
  /* 缩略图是 4:3，框也按 4:3 走，这样按框还原时不会变形。
     方形的缩略图（时间线上那个小图）就以框的中心为准裁一下。 */
  const CROP_RATIO = 4 / 3;
  let cropFrame = null;                // { fw, fh, fx, fy } 像素
  let cropDone = null;

  function clampCrop(f, dw, dh) {
    const fw = Math.max(60, Math.min(f.fw, dw, dh * CROP_RATIO));
    const fh = fw / CROP_RATIO;
    return {
      fw,
      fh,
      fx: Math.min(Math.max(0, f.fx), Math.max(0, dw - fw)),
      fy: Math.min(Math.max(0, f.fy), Math.max(0, dh - fh))
    };
  }

  function paintCropFrame() {
    if (!cropFrame) return;
    const b = $('cropFrame');
    b.style.left = cropFrame.fx + 'px';
    b.style.top = cropFrame.fy + 'px';
    b.style.width = cropFrame.fw + 'px';
    b.style.height = cropFrame.fh + 'px';
  }

  function openCropper(src, crop, onDone) {
    cropDone = onDone || null;
    cropFrame = null;
    $('cropErr').textContent = '';
    $('cropFrame').hidden = true;

    const img = $('cropImg');
    img.src = src;
    openModal('cropMask');

    let tries = 0;
    const place = () => {
      const dw = img.clientWidth;
      const dh = img.clientHeight;
      if ((!dw || !dh) && tries++ < 40) { requestAnimationFrame(place); return; }
      if (!dw || !dh) { $('cropErr').textContent = '图片没加载出来，换一张试试。'; return; }

      let f;
      if (crop && crop.w > 0 && crop.h > 0) {
        f = { fw: crop.w * dw, fh: crop.h * dh, fx: crop.x * dw, fy: crop.y * dh };
      } else {
        const fw = Math.min(dw, dh * CROP_RATIO);
        f = { fw, fh: fw / CROP_RATIO, fx: (dw - fw) / 2, fy: (dh - fw / CROP_RATIO) / 2 };
      }
      cropFrame = clampCrop(f, dw, dh);
      paintCropFrame();
      $('cropFrame').hidden = false;
    };
    requestAnimationFrame(place);
  }

  /* 拖方框、拖右下角 */
  function bindCropper() {
    const frame = $('cropFrame');
    const img = $('cropImg');
    let mode = null, sx = 0, sy = 0, base = null;

    frame.addEventListener('pointerdown', (e) => {
      if (!cropFrame) return;
      mode = e.target.classList.contains('crop-grip') ? 'size' : 'move';
      sx = e.clientX; sy = e.clientY;
      base = Object.assign({}, cropFrame);
      e.preventDefault();
      try { frame.setPointerCapture(e.pointerId); } catch (_) { }
    });

    frame.addEventListener('pointermove', (e) => {
      if (!mode || !base) return;
      const dw = img.clientWidth, dh = img.clientHeight;
      if (!dw || !dh) return;

      const dx = e.clientX - sx, dy = e.clientY - sy;
      const f = Object.assign({}, base);
      if (mode === 'move') {
        f.fx = base.fx + dx;
        f.fy = base.fy + dy;
      } else {
        /* 往右拖或往下拖都在放大，取变化大的那个方向 */
        f.fw = base.fw + Math.max(dx, dy * CROP_RATIO);
      }
      cropFrame = clampCrop(f, dw, dh);
      paintCropFrame();
    });

    const end = () => { mode = null; base = null; };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
  }

  /* 卡片上的照片：框过就按框显示，没框过还是老的居中裁切 */
  function paintPhoto(box, m, square) {
    const crop = m.crop;
    if (!crop || !(crop.w > 0) || !(crop.h > 0)) {
      const img = document.createElement('img');
      img.src = m.photo;
      img.alt = m.title || '回忆';
      img.loading = 'lazy';
      box.appendChild(img);
      return;
    }

    box.style.backgroundImage = 'url("' + m.photo + '")';
    box.style.backgroundRepeat = 'no-repeat';

    if (square) {
      const cx = (crop.x + crop.w / 2) * 100;
      const cy = (crop.y + crop.h / 2) * 100;
      box.style.backgroundSize = 'cover';
      box.style.backgroundPosition = cx.toFixed(2) + '% ' + cy.toFixed(2) + '%';
    } else {
      /* 4:3 的框放进 4:3 的格子里，正好还原，不会拉伸 */
      const sw = 100 / crop.w;
      const sh = 100 / crop.h;
      const px = crop.w < 1 ? (crop.x / (1 - crop.w)) * 100 : 0;
      const py = crop.h < 1 ? (crop.y / (1 - crop.h)) * 100 : 0;
      box.style.backgroundSize = sw.toFixed(2) + '% ' + sh.toFixed(2) + '%';
      box.style.backgroundPosition = px.toFixed(2) + '% ' + py.toFixed(2) + '%';
    }
  }

  /* ---------- 看大图 ---------- */
  let lbOpenedAt = 0;
  function openLightbox(src) {
    $('lightboxImg').src = src;
    $('lightboxImg').hidden = false;
    $('lightboxCap').innerHTML = '';
    $('lightboxCmt').innerHTML = '';
    lbOpenedAt = Date.now();
    $('lightbox').classList.add('is-on');
  }

  /* 时间线上点开一条：图看大，说明看全 */
  function openMemory(m) {
    const img = $('lightboxImg');
    if (m.photo) {
      img.src = m.photo;
      img.alt = m.title || '回忆';
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }

    const cap = $('lightboxCap');
    cap.innerHTML = '';
    if (m.title) cap.appendChild(el('div', 'lb-title', m.title));
    if (m.note) cap.appendChild(el('div', 'lb-note', m.note));

    const meta = el('div', 'lb-meta');
    if (m.author) meta.appendChild(el('span', null, m.author));
    if (m.happened_at) meta.appendChild(el('span', null, fmtDate(m.happened_at)));
    if (meta.childNodes.length) cap.appendChild(meta);

    /* 老照片也能补一个取景：点开还是整张，卡片上按框显示 */
    if (m.photo) {
      const tune = el('button', 'lb-tune', '调整卡片取景');
      tune.type = 'button';
      tune.addEventListener('click', (e) => {
        e.stopPropagation();
        openCropper(m.photo, m.crop, async (c) => {
          try {
            await API.setMemoryCrop(m.id, c);
            m.crop = c;
            renderMemPane();
            closeLightbox();
            toast('卡片改好了');
          } catch (err) {
            toast(err.message === 'KEY' ? HOLE.keyWrong : '没改成，等下再试');
          }
        });
      });
      cap.appendChild(tune);
    }

    /* 评论跟在下面，看得见才算数 */
    const cmt = $('lightboxCmt');
    cmt.innerHTML = '';
    cmt.appendChild(el('div', 'cmt-heading', HOLE.commentNone));
    cmt.appendChild(commentBox('memory', m.id));

    lbOpenedAt = Date.now();
    $('lightbox').classList.add('is-on');
  }

  function closeLightbox() {
    // 手指抬起那一下的点击会紧接着落在刚出现的浮层上，别让它把浮层关掉
    if (Date.now() - lbOpenedAt < 400) return;
    $('lightbox').classList.remove('is-on');
    setTimeout(() => {
      if ($('lightbox').classList.contains('is-on')) return;
      $('lightboxImg').removeAttribute('src');
      $('lightboxCap').innerHTML = '';
      $('lightboxCmt').innerHTML = '';
    }, 300);
  }

  /* ---------- 口令 ---------- */
  let keyResolver = null;

  function askKey() {
    return new Promise((resolve) => {
      keyResolver = resolve;
      $('keyTitle').textContent = HOLE.keyPrompt;
      $('keySub').textContent = '（' + HOLE.keyHint + '）';
      $('keyErr').textContent = '';
      $('keyInput').value = '';
      $('keyInput').placeholder = '答案';
      openModal('keyMask');
      setTimeout(() => $('keyInput').focus(), 300);
    });
  }

  async function submitKey() {
    const v = $('keyInput').value.trim();
    if (!v) { $('keyErr').textContent = '总得写点什么。'; return; }
    $('keyOk').disabled = true;
    try {
      const ok = await API.verifyKey(v);
      if (ok) {
        API.setKey(v);
        closeModal('keyMask');
        if (keyResolver) { keyResolver(true); keyResolver = null; }
      } else {
        $('keyErr').textContent = HOLE.keyWrong;
        $('keyInput').select();
      }
    } catch (e) {
      $('keyErr').textContent = '网络不太行，等下再试。';
    } finally {
      $('keyOk').disabled = false;
    }
  }

  async function ensureKey() {
    // 记住的口令要重新核一遍：本地预览时和 config 里的答案比，
    // 线上则信任它（真的过期了，写入时会拿到 401 再补问）
    if (await API.checkStoredKey()) return true;
    return askKey();
  }

  function handleKeyError() {
    API.clearKey();
    toast('口令过期了，再对一次暗号');
    askKey().then((ok) => { if (ok) toast('好了，再点一次刚才的按钮'); });
  }

  /* ---------- 顶部那一行 ---------- */
  function renderStats() {
    if (!$('todayLine')) return;
    $('todayLine').textContent = HOLE.todayLine
      .replace('{date}', fmtToday())
      .replace('{mem}', memItems.length)
      .replace('{msg}', msgItems.length);
  }

  /* ---------- 渲染：回忆（网格） ---------- */
  function renderMemories() {
    const grid = $('memGrid');
    grid.innerHTML = '';
    $('memEmpty').hidden = memItems.length > 0;
    $('memEmpty').textContent = HOLE.emptyMemories;

    memItems.forEach((m, i) => {
      const card = el('article', 'mem-card');
      card.style.animationDelay = Math.min(i * 60, 600) + 'ms';
      /* 整张卡片都能点开：图、字、评论一起看 */
      onTap(card, () => openMemory(m), 'button');

      const photo = el('div', 'mem-photo');
      if (m.photo) {
        paintPhoto(photo, m);
      } else {
        photo.classList.add('is-empty');
      }

      const text = el('div', 'mem-text');
      if (m.title) text.appendChild(el('div', 'mem-title', m.title));
      if (m.note) text.appendChild(el('div', 'mem-note', m.note));

      const meta = el('div', 'mem-meta');
      if (m.author) meta.appendChild(el('span', null, m.author));
      if (m.author && m.happened_at) meta.appendChild(el('i', 'dot'));
      if (m.happened_at) meta.appendChild(el('span', null, fmtDate(m.happened_at)));
      meta.appendChild(countTag('memory', m.id));

      if (meta.childNodes.length) text.appendChild(meta);

      const del = el('button', 'del-btn', '×');
      del.title = '删掉这条';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removeMemory(m);
      });

      card.append(photo, text, del);
      grid.appendChild(card);
    });
  }

  /* ---------- 渲染：回忆（时间线） ---------- */
  function memYear(m) {
    const raw = m.happened_at || m.created_at || '';
    const y = String(raw).slice(0, 4);
    return /^\d{4}$/.test(y) ? y : '很久以前';
  }

  function renderTimeline() {
    const box = $('memTimeline');
    box.innerHTML = '';
    if (!memItems.length) return;

    /* 有确切日子的按日子排，没有的退回到收藏那天 */
    const sorted = memItems.slice().sort((a, b) => {
      const ka = String(a.happened_at || a.created_at || '');
      const kb = String(b.happened_at || b.created_at || '');
      return kb.localeCompare(ka);
    });

    let lastYear = null;
    sorted.forEach((m, i) => {
      const y = memYear(m);
      if (y !== lastYear) {
        lastYear = y;
        const head = el('div', 'tl-year');
        head.appendChild(el('span', 'tl-year-num', y));
        const n = sorted.filter(x => memYear(x) === y).length;
        head.appendChild(el('span', 'tl-year-count', n + ' 段'));
        box.appendChild(head);
      }

      const row = el('div', 'tl-item');
      row.style.animationDelay = Math.min(i * 45, 450) + 'ms';

      const side = el('div', 'tl-side');
      const when = m.happened_at ? fmtDate(m.happened_at).slice(5) : '';
      side.appendChild(el('span', 'tl-date', when));
      side.appendChild(el('i', 'tl-dot'));

      const card = el('div', 'tl-card');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      onTap(card, () => openMemory(m));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMemory(m); }
      });

      if (m.photo) {
        const thumb = el('div', 'tl-thumb');
        paintPhoto(thumb, m, true);
        card.appendChild(thumb);
      }

      const body = el('div', 'tl-body');
      if (m.title) body.appendChild(el('div', 'tl-title', m.title));
      if (m.note) body.appendChild(el('div', 'tl-note', m.note));
      const meta = el('div', 'tl-meta');
      if (m.author) meta.appendChild(el('span', null, m.author));
      meta.appendChild(countTag('memory', m.id));
      if (meta.childNodes.length) body.appendChild(meta);
      card.appendChild(body);

      const del = el('button', 'del-btn', '×');
      del.title = '删掉这条';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removeMemory(m);
      });
      card.appendChild(del);

      row.append(side, card);
      box.appendChild(row);
    });
  }

  function renderMemPane() {
    renderMemories();
    if (memView === 'timeline') renderTimeline();
    $('memGrid').hidden = memView !== 'grid';
    $('memTimeline').hidden = memView !== 'timeline';
  }

  function setView(v) {
    memView = v;
    document.querySelectorAll('#viewSwitch button').forEach(b => {
      b.classList.toggle('is-on', b.dataset.view === v);
    });
    renderMemPane();
  }

  /* ---------- 随便看看 ---------- */
  let lastShuffleId = null;

  function shuffleMemory() {
    if (!memItems.length) { toast('还没有回忆，先放一张吧'); return; }
    let pool = memItems;
    if (memItems.length > 1 && lastShuffleId != null) {
      pool = memItems.filter((x) => String(x.id) !== String(lastShuffleId));
    }
    const m = pool[Math.floor(Math.random() * pool.length) || 0];
    lastShuffleId = m.id;
    openMemory(m);
  }

  /* ---------- 渲染：留言 ---------- */
  function renderMessages() {
    const list = $('msgList');
    list.innerHTML = '';
    $('msgEmpty').hidden = msgItems.length > 0;
    $('msgEmpty').textContent = HOLE.emptyMessages;

    msgItems.forEach((m, i) => {
      const card = el('article', 'msg-card');
      card.style.animationDelay = Math.min(i * 50, 500) + 'ms';

      const head = el('div', 'msg-head');
      head.appendChild(el('span', 'msg-author', m.author || '匿名'));
      head.appendChild(el('span', 'msg-time', fmtTime(m.created_at)));

      const body = el('div', 'msg-body', m.content);

      const del = el('button', 'del-btn', '×');
      del.title = '删掉这条';
      del.addEventListener('click', () => removeMessage(m));

      card.append(head, body);

      const shots = Array.isArray(m.photos) ? m.photos.filter(Boolean) : [];
      if (shots.length) {
        const strip = el('div', 'msg-shots');
        shots.forEach((src) => {
          const th = el('button', 'msg-thumb');
          const img = document.createElement('img');
          img.src = src;
          img.alt = '照片';
          img.loading = 'lazy';
          th.appendChild(img);
          th.addEventListener('click', () => openLightbox(src));
          strip.appendChild(th);
        });
        card.appendChild(strip);
      }

      const foot = el('div', 'msg-foot');
      foot.appendChild(countTag('message', m.id));
      card.appendChild(foot);

      card.appendChild(del);

      /* 点开才看见评论，再点收起 */
      onTap(card, () => {
        const open = card.querySelector('.cmt-box');
        if (open) {
          open.remove();
          card.classList.remove('is-open');
          return;
        }
        card.classList.add('is-open');
        card.appendChild(commentBox('message', m.id));
      }, '.cmt-box, button, input, a');

      list.appendChild(card);
    });
  }

  /* ---------- 渲染：一起做清单 ---------- */
  function renderTodos() {
    const list = $('todoList');
    list.innerHTML = '';
    $('todoEmpty').hidden = todoItems.length > 0;
    $('todoEmpty').textContent = HOLE.emptyTodos;

    const doneCount = todoItems.filter(t => t.done).length;
    const clearBtn = $('clearDone');
    clearBtn.hidden = doneCount === 0;
    clearBtn.textContent = HOLE.clearDone + '（' + doneCount + '）';

    todoItems.forEach((t, i) => {
      const row = el('div', 'todo-item' + (t.done ? ' is-done' : ''));
      row.style.animationDelay = Math.min(i * 40, 400) + 'ms';

      const check = el('button', 'todo-check');
      check.setAttribute('aria-label', t.done ? '撤销' : '做完了');
      check.addEventListener('click', () => toggleTodo(t));

      const main = el('div', 'todo-main');
      main.appendChild(el('span', 'todo-text', t.text));
      const meta = el('span', 'todo-meta');
      if (t.author) meta.textContent = t.author;
      if (t.done && t.done_at) {
        meta.textContent = (t.author ? t.author + '　' : '') + fmtDate(t.done_at) + ' 做完了';
      }
      if (meta.textContent) main.appendChild(meta);

      const del = el('button', 'del-btn', '×');
      del.title = '删掉这条';
      del.addEventListener('click', () => removeTodo(t));

      row.append(check, main, del);
      list.appendChild(row);
    });
  }

  /* ---------- 删除 ---------- */
  async function removeMemory(m) {
    if (!confirm('删掉「' + (m.title || '这段回忆') + '」？删了就找不回来了。')) return;
    if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }
    try {
      await API.delMemory(m.id);
      memItems = memItems.filter(x => String(x.id) !== String(m.id));
      renderMemPane();
      renderStats();
      toast('删掉了');
    } catch (e) {
      if (e.message === 'KEY') handleKeyError();
      else toast('没删掉，等下再试');
    }
  }

  async function removeMessage(m) {
    if (!confirm('删掉这条留言？')) return;
    if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }
    try {
      await API.delMessage(m.id);
      msgItems = msgItems.filter(x => String(x.id) !== String(m.id));
      renderMessages();
      renderStats();
      toast('删掉了');
    } catch (e) {
      if (e.message === 'KEY') handleKeyError();
      else toast('没删掉，等下再试');
    }
  }

  async function removeTodo(t) {
    if (!confirm('删掉「' + t.text + '」？')) return;
    if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }
    try {
      await API.delTodo(t.id);
      todoItems = todoItems.filter(x => String(x.id) !== String(t.id));
      renderTodos();
      toast('删掉了');
    } catch (e) {
      if (e.message === 'KEY') handleKeyError();
      else toast('没删掉，等下再试');
    }
  }

  async function clearDoneTodos() {
    const done = todoItems.filter(t => t.done);
    if (!done.length) return;
    if (!confirm('把已经做完的这 ' + done.length + ' 件收起来？') ) return;
    if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }
    try {
      for (const t of done) await API.delTodo(t.id);
      const ids = new Set(done.map(t => String(t.id)));
      todoItems = todoItems.filter(x => !ids.has(String(x.id)));
      renderTodos();
      toast('收好了');
    } catch (e) {
      if (e.message === 'KEY') handleKeyError();
      else toast('没弄完，等下再试');
    }
  }

  /* ---------- 图片压缩 ---------- */
  async function loadBitmap(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch { return await createImageBitmap(file); }
    }
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function compress(file, maxSide, quality) {
    const bmp = await loadBitmap(file);
    const w0 = bmp.width, h0 = bmp.height;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();

    return c.toDataURL('image/jpeg', quality);
  }

  async function compressForUpload(file, maxSide, quality, limit) {
    maxSide = maxSide || 1600;
    let q = quality || 0.86;
    const LIMIT = limit || 560 * 1024;
    let side = maxSide;
    let out = await compress(file, side, q);

    while (out.length > LIMIT) {
      if (q > 0.55) { q -= 0.09; }
      else if (side > 700) { side -= 250; q = 0.72; }
      else break;
      out = await compress(file, side, q);
    }
    if (out.length > LIMIT) throw new Error('这张图太大了，换一张试试');
    return out;
  }

  /* ---------- 添加：回忆 ---------- */
  let pendingPhoto = null;
  let pendingCrop = null;

  function setPreview(dataUrl) {
    pendingPhoto = dataUrl;
    pendingCrop = null;
    const img = $('dropPreview');
    const drop = $('drop');
    const pick = $('cropPickBtn');
    if (dataUrl) {
      img.src = dataUrl;
      img.hidden = false;
      drop.classList.add('has-img');
      if (pick) pick.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      drop.classList.remove('has-img');
      if (pick) pick.hidden = true;
    }
  }

  async function onFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('这不是图片'); return; }
    $('memErr').textContent = '处理中……';
    try {
      const dataUrl = await compressForUpload(file);
      setPreview(dataUrl);
      $('memErr').textContent = '';
    } catch (e) {
      $('memErr').textContent = e.message || '读不了这张图';
      setPreview(null);
    }
  }

  function openMemModal() {
    setPreview(null);
    $('memTitle').value = '';
    $('memNote').value = '';
    $('memDate').value = '';
    $('memErr').textContent = '';
    openModal('memMask');
  }

  async function submitMemory() {
    const title = $('memTitle').value.trim();
    const note = $('memNote').value.trim();
    if (!pendingPhoto && !title && !note) {
      $('memErr').textContent = '空的，放张照片或者写点什么。';
      return;
    }
    $('memOk').disabled = true;
    $('memErr').textContent = '';
    try {
      const item = await API.addMemory({
        photo: pendingPhoto || null,
        title: title || null,
        note: note || null,
        happened_at: $('memDate').value || null,
        author: pendingMemAuthor || null,
        crop: pendingCrop || null
      });
      memItems.unshift(item);
      renderMemPane();
      renderStats();
      closeModal('memMask');
      toast('放进去了');
    } catch (e) {
      if (e.message === 'KEY') { closeModal('memMask'); handleKeyError(); }
      else $('memErr').textContent = '没存上：' + e.message;
    } finally {
      $('memOk').disabled = false;
    }
  }

  /* ---------- 添加：留言（可带两张图） ---------- */
  let msgPhotos = [null, null];
  let pickTarget = 0;

  function renderMsgPicker() {
    const box = $('msgPicker');
    box.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const slot = el('div', 'mini-slot');
      if (msgPhotos[i]) {
        slot.classList.add('has-img');
        const img = document.createElement('img');
        img.src = msgPhotos[i];
        img.alt = '照片 ' + (i + 1);
        slot.appendChild(img);
        const rm = el('button', 'mini-rm', '×');
        rm.title = '拿掉这张';
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          msgPhotos[i] = null;
          renderMsgPicker();
        });
        slot.appendChild(rm);
      } else {
        slot.appendChild(el('span', 'mini-plus', '+'));
      }
      slot.addEventListener('click', () => {
        if (msgPhotos[i]) return;
        pickTarget = i;
        $('msgFile').value = '';
        $('msgFile').click();
      });
      box.appendChild(slot);
    }
  }

  function openMsgModal() {
    $('msgContent').value = '';
    $('msgErr').textContent = '';
    msgPhotos = [null, null];
    renderMsgPicker();
    openModal('msgMask');
    setTimeout(() => $('msgContent').focus(), 320);
  }

  async function submitMessage() {
    const content = $('msgContent').value.trim();
    const shots = msgPhotos.filter(Boolean);
    if (!content && !shots.length) { $('msgErr').textContent = '还没写呢。'; return; }
    $('msgOk').disabled = true;
    $('msgErr').textContent = '';
    try {
      const item = await API.addMessage({
        author: msgAuthor || null,
        content: content || '（一张照片）',
        photos: shots
      });
      msgItems.unshift(item);
      renderMessages();
      renderStats();
      closeModal('msgMask');
      toast('说出去了');
    } catch (e) {
      if (e.message === 'KEY') { closeModal('msgMask'); handleKeyError(); }
      else $('msgErr').textContent = '没发出去：' + e.message;
    } finally {
      $('msgOk').disabled = false;
    }
  }

  /* ---------- 添加：一起做清单 ---------- */
  function openTodoModal() {
    $('todoText').value = '';
    $('todoErr').textContent = '';
    openModal('todoMask');
    setTimeout(() => $('todoText').focus(), 320);
  }

  async function submitTodo() {
    const text = $('todoText').value.trim();
    if (!text) { $('todoErr').textContent = '写一件想做的事。'; return; }
    $('todoOk').disabled = true;
    $('todoErr').textContent = '';
    try {
      const item = await API.addTodo({ text, author: todoAuthor || null });
      todoItems.unshift(item);
      renderTodos();
      closeModal('todoMask');
      toast('记下了');
    } catch (e) {
      if (e.message === 'KEY') { closeModal('todoMask'); handleKeyError(); }
      else $('todoErr').textContent = '没记上：' + e.message;
    } finally {
      $('todoOk').disabled = false;
    }
  }

  async function toggleTodo(t) {
    if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }
    const next = !t.done;
    try {
      const item = await API.toggleTodo(t.id, next);
      todoItems = todoItems.map(x => String(x.id) === String(t.id) ? Object.assign({}, x, item || {}) : x);
      todoItems.sort((a, b) => {
        if (!!a.done !== !!b.done) return a.done ? 1 : -1;
        return String(b.created_at).localeCompare(String(a.created_at));
      });
      renderTodos();
      if (next) toast('又少一件');
    } catch (e) {
      if (e.message === 'KEY') handleKeyError();
      else toast('没改成，等下再试');
    }
  }

  /* ---------- 作者选择 ---------- */
  function buildChips(container, list, onPick, initial) {
    container.innerHTML = '';
    list.forEach((name) => {
      const b = el('button', 'chip', name);
      if (name === initial) b.classList.add('is-on');
      b.addEventListener('click', () => {
        [...container.children].forEach(c => c.classList.remove('is-on'));
        b.classList.add('is-on');
        onPick(name);
      });
      container.appendChild(b);
    });
  }

  /* ---------- 加载 ---------- */
  async function loadAll() {
    for (let i = 0; i < 3; i++) $('memGrid').appendChild(el('div', 'skeleton'));
    try {
      const [mems, msgs, todos] = await Promise.all([
        API.listMemories(), API.listMessages(), API.listTodos()
      ]);
      memItems = mems;
      msgItems = msgs;
      todoItems = todos;

      /* 评论条数单独拉一次，拿不到也不影响页面 */
      try { commentCounts = await API.listCommentCounts(); } catch { commentCounts = {}; }

      renderMemPane();
      renderMessages();
      renderTodos();
      renderStats();
    } catch (e) {
      $('memGrid').innerHTML = '';
      $('memEmpty').hidden = false;
      $('memEmpty').textContent = '没能读到数据。检查一下网络，或者稍后再来。';
    }
  }

  /* ---------- 切换 ---------- */
  function switchPane(name) {
    currentPane = name;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('is-on', t.dataset.pane === name);
    });
    document.querySelectorAll('.pane').forEach(p => {
      p.classList.toggle('is-on', p.id === 'pane-' + name);
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    $('brand').textContent = HOLE.brand;
    $('tabMemories').textContent = HOLE.tabs.memories;
    $('tabMessages').textContent = HOLE.tabs.messages;
    $('tabTodos').textContent = HOLE.tabs.todos;
    $('hintMemories').textContent = HOLE.hintMemories;
    $('hintMessages').textContent = HOLE.hintMessages;
    $('hintTodos').textContent = HOLE.hintTodos;
    $('viewSwitch').children[0].textContent = HOLE.viewGrid;
    $('viewSwitch').children[1].textContent = HOLE.viewTimeline;
    document.querySelector('[data-add="memory"]').textContent = HOLE.addMemory;
    document.querySelector('[data-add="message"]').textContent = HOLE.addMessage;
    document.querySelector('[data-add="todo"]').textContent = HOLE.addTodo;

    document.querySelectorAll('.tab').forEach(t => {
      onTap(t, () => switchPane(t.dataset.pane), null);
    });

    document.querySelectorAll('#viewSwitch button').forEach(b => {
      onTap(b, () => setView(b.dataset.view), null);
    });

    /* 随便看看：随机翻一段旧回忆，不连着翻到同一条 */
    $('shuffleBtn').textContent = HOLE.shuffle;
    onTap($('shuffleBtn'), shuffleMemory, null);

    /* 取景 */
    bindCropper();
    $('cropPickBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pendingPhoto) return;
      openCropper(pendingPhoto, pendingCrop, (c) => {
        pendingCrop = c;
        toast('卡片就显示这块');
      });
    });
    $('cropOk').addEventListener('click', () => {
      if (!cropFrame) { closeModal('cropMask'); return; }
      const img = $('cropImg');
      const dw = img.clientWidth;
      const dh = img.clientHeight;
      const f = cropFrame;
      const crop = {
        x: +(f.fx / dw).toFixed(4),
        y: +(f.fy / dh).toFixed(4),
        w: +(f.fw / dw).toFixed(4),
        h: +(f.fh / dh).toFixed(4)
      };
      const cb = cropDone;
      cropDone = null;
      closeModal('cropMask');
      if (cb) cb(crop);
    });

    $('clearDone').addEventListener('click', clearDoneTodos);

    /* FAB */
    const fab = $('fab'), menu = $('fabMenu');
    fab.addEventListener('click', () => {
      const on = menu.classList.toggle('is-on');
      fab.classList.toggle('is-open', on);
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !fab.contains(e.target)) {
        menu.classList.remove('is-on');
        fab.classList.remove('is-open');
      }
    });

    menu.querySelector('[data-add="memory"]').addEventListener('click', async () => {
      menu.classList.remove('is-on'); fab.classList.remove('is-open');
      if (await ensureKey()) openMemModal();
    });
    menu.querySelector('[data-add="message"]').addEventListener('click', async () => {
      menu.classList.remove('is-on'); fab.classList.remove('is-open');
      if (await ensureKey()) openMsgModal();
    });
    menu.querySelector('[data-add="todo"]').addEventListener('click', async () => {
      menu.classList.remove('is-on'); fab.classList.remove('is-open');
      if (await ensureKey()) openTodoModal();
    });

    /* 回忆选图 */
    const drop = $('drop'), fileInput = $('fileInput');
    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => onFile(e.target.files[0]));
    ['dragover', 'dragenter'].forEach(ev =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-drag'); }));
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onFile(f);
    });

    /* 留言选图 */
    $('msgFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('这不是图片'); return; }
      $('msgErr').textContent = '处理中……';
      try {
        const d = await compressForUpload(f, 1000, 0.82, 380 * 1024);
        msgPhotos[pickTarget] = d;
        renderMsgPicker();
        $('msgErr').textContent = '';
      } catch (err) {
        $('msgErr').textContent = err.message || '读不了这张图';
      }
    });

    /* 确认按钮 */
    $('memOk').addEventListener('click', submitMemory);
    $('msgOk').addEventListener('click', submitMessage);
    $('todoOk').addEventListener('click', submitTodo);
    $('todoText').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitTodo();
    });

    /* 口令 */
    $('keyOk').addEventListener('click', submitKey);
    $('keyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitKey();
    });

    /* 看大图：只有点外面的黑边才关，点图片、点输入框都不关 */
    $('lightbox').addEventListener('click', (e) => {
      if (e.target === $('lightbox')) closeLightbox();
    });

    /* 关闭 */
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal-mask').forEach(mask => {
      mask.addEventListener('click', (e) => {
        if (e.target === mask) {
          if (mask.id === 'keyMask' && keyResolver) { keyResolver(false); keyResolver = null; }
          mask.classList.remove('is-on');
        }
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if ($('lightbox').classList.contains('is-on')) { closeLightbox(); return; }
        document.querySelectorAll('.modal-mask.is-on').forEach(m => m.classList.remove('is-on'));
      }
    });

    /* 作者 chips */
    buildChips($('memAuthorChips'), HOLE.authors, (n) => { pendingMemAuthor = n; }, HOLE.authors[0]);
    buildChips($('msgAuthorChips'), HOLE.authors, (n) => { msgAuthor = n; }, HOLE.authors[0]);
    buildChips($('todoAuthorChips'), HOLE.authors, (n) => { todoAuthor = n; }, HOLE.authors[0]);

    API.probe().then((mode) => {
      if (mode === 'local') {
        console.info('[树洞] 当前是本地预览模式，数据只存在这台设备上。');
      }
    });

    loadAll();
  }

  return { init, switchPane };
})();
