/* ============================================================
   hole.js —— 第三幕：树洞（回忆 / 留言）
   ============================================================ */

const Hole = (function () {

  const $ = (id) => document.getElementById(id);

  let memItems = [];
  let msgItems = [];
  let currentPane = 'memories';
  let pendingMemAuthor = HOLE.authors[0];

  /* ---------- 小工具 ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
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

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('is-on'), 2400);
  }

  function openModal(id) { $(id).classList.add('is-on'); }
  function closeModal(id) { $(id).classList.remove('is-on'); }

  /* ---------- 口令 ---------- */
  let keyResolver = null;

  function askKey() {
    return new Promise((resolve) => {
      keyResolver = resolve;
      $('keyTitle').textContent = HOLE.keyPrompt;
      $('keySub').textContent = HOLE.keyHint;
      $('keyErr').textContent = '';
      $('keyInput').value = '';
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
    if (API.hasKey()) {
      // 已经有口令，但可能失效，交给后续请求去判定
      return true;
    }
    return askKey();
  }

  function handleKeyError() {
    API.clearKey();
    toast('口令过期了，再对一次暗号');
    askKey().then((ok) => { if (ok) toast('好了，再点一次刚才的按钮'); });
  }

  /* ---------- 渲染：回忆 ---------- */
  function renderMemories() {
    const grid = $('memGrid');
    grid.innerHTML = '';
    $('memEmpty').hidden = memItems.length > 0;
    $('memEmpty').textContent = HOLE.emptyMemories;

    memItems.forEach((m, i) => {
      const card = el('article', 'mem-card');
      card.style.animationDelay = Math.min(i * 60, 600) + 'ms';

      const photo = el('div', 'mem-photo');
      if (m.photo) {
        const img = document.createElement('img');
        img.src = m.photo;
        img.alt = m.title || '回忆';
        img.loading = 'lazy';
        photo.appendChild(img);
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

      card.append(head, body, del);
      list.appendChild(card);
    });
  }

  /* ---------- 删除 ---------- */
  async function removeMemory(m) {
    if (!confirm('删掉「' + (m.title || '这段回忆') + '」？删了就找不回来了。')) return;
    if (!API.hasKey()) { const ok = await ensureKey(); if (!ok) return; }
    try {
      await API.delMemory(m.id);
      memItems = memItems.filter(x => String(x.id) !== String(m.id));
      renderMemories();
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
      toast('删掉了');
    } catch (e) {
      if (e.message === 'KEY') handleKeyError();
      else toast('没删掉，等下再试');
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

  async function compressForUpload(file) {
    const LIMIT = 560 * 1024;               // dataURL 长度上限，安全底线
    let side = 1600, q = 0.86;
    let out = await compress(file, side, q);

    while (out.length > LIMIT) {
      if (q > 0.55) { q -= 0.09; }
      else if (side > 900) { side -= 300; q = 0.72; }
      else break;
      out = await compress(file, side, q);
    }
    if (out.length > LIMIT) throw new Error('这张图太大了，换一张试试');
    return out;
  }

  /* ---------- 添加：回忆 ---------- */
  let pendingPhoto = null;

  function setPreview(dataUrl) {
    pendingPhoto = dataUrl;
    const img = $('dropPreview');
    const drop = $('drop');
    if (dataUrl) {
      img.src = dataUrl;
      img.hidden = false;
      drop.classList.add('has-img');
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      drop.classList.remove('has-img');
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
        author: pendingMemAuthor || null
      });
      memItems.unshift(item);
      renderMemories();
      closeModal('memMask');
      toast('放进去了');
    } catch (e) {
      if (e.message === 'KEY') { closeModal('memMask'); handleKeyError(); }
      else $('memErr').textContent = '没存上：' + e.message;
    } finally {
      $('memOk').disabled = false;
    }
  }

  /* ---------- 添加：留言 ---------- */
  function openMsgModal() {
    $('msgContent').value = '';
    $('msgErr').textContent = '';
    openModal('msgMask');
    setTimeout(() => $('msgContent').focus(), 320);
  }

  async function submitMessage() {
    const content = $('msgContent').value.trim();
    if (!content) { $('msgErr').textContent = '还没写呢。'; return; }
    $('msgOk').disabled = true;
    $('msgErr').textContent = '';
    try {
      const item = await API.addMessage({
        author: msgAuthor || null,
        content: content
      });
      msgItems.unshift(item);
      renderMessages();
      closeModal('msgMask');
      toast('说出去了');
    } catch (e) {
      if (e.message === 'KEY') { closeModal('msgMask'); handleKeyError(); }
      else $('msgErr').textContent = '没发出去：' + e.message;
    } finally {
      $('msgOk').disabled = false;
    }
  }

  /* ---------- 作者选择 ---------- */
  let msgAuthor = HOLE.authors[0];

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
    const grid = $('memGrid');
    for (let i = 0; i < 3; i++) grid.appendChild(el('div', 'skeleton'));
    try {
      const [mems, msgs] = await Promise.all([API.listMemories(), API.listMessages()]);
      memItems = mems;
      msgItems = msgs;
      renderMemories();
      renderMessages();
    } catch (e) {
      grid.innerHTML = '';
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
    document.querySelector('[data-add="memory"]').textContent = HOLE.addMemory;
    document.querySelector('[data-add="message"]').textContent = HOLE.addMessage;

    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => switchPane(t.dataset.pane));
    });

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

    /* 图片选择 */
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

    /* 确认按钮 */
    $('memOk').addEventListener('click', submitMemory);
    $('msgOk').addEventListener('click', submitMessage);

    /* 口令 */
    $('keyOk').addEventListener('click', submitKey);
    $('keyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitKey();
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
        document.querySelectorAll('.modal-mask.is-on').forEach(m => m.classList.remove('is-on'));
      }
    });

    /* 作者 chips */
    buildChips($('memAuthorChips'), HOLE.authors, (n) => { pendingMemAuthor = n; }, HOLE.authors[0]);
    buildChips($('msgAuthorChips'), HOLE.authors, (n) => { msgAuthor = n; }, HOLE.authors[0]);

    API.probe().then((mode) => {
      if (mode === 'local') {
        console.info('[树洞] 当前是本地预览模式，数据只存在这台设备上。');
      }
    });

    loadAll();
  }

  return { init, switchPane };
})();
