// ==UserScript==
// @name         Donmai 一键下载原图（danbooru / donmai.moe）
// @namespace    https://github.com/kitsuneMori96/donmai-moe-downloader
// @version      0.4.0
// @description  列表页缩略图右下角加下载按钮（下载原图并自动收藏），详情页大图角落 + Information Size 行加按钮，可配下载子目录与文件名模板
// @author       kitsuneMori96
// @match        https://danbooru.donmai.us/posts*
// @match        https://danbooru.donmai.us/posts/*
// @match        https://donmai.moe/posts*
// @match        https://donmai.moe/posts/*
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      danbooru.donmai.us
// @connect      donmai.moe
// @connect      cdn.donmai.us
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* 真实 DOM（2026-09-28 有头 Chrome 于 donmai.moe 实测；danbooru.donmai.us 为上游同源代码，选择器一致）：
   * 列表: .posts-container > article.post-preview[data-id="10872602"] > div.post-preview-container
   *       > a.post-preview-link[href="/posts/ID"] > picture > img.post-preview-image[src=180x180预览]
   *       注：缩略图 img 无原图地址，必须调 /posts/:id.json 取 file_url
   * 详情: section#post-information > ul > li#post-info-size >
   *       <a href="https://cdn.donmai.us/original/..jpg">3.95 MB .jpg</a>(2880x1620)
   *       大图: section.image-container.note-container[data-id][data-file-url] > picture > img#image
   *       JSON: /posts/:id.json -> {file_url, large_file_url, preview_file_url, file_ext}
   */

  GM_addStyle(`
    /* 含蓄风格：平时几乎不可见，悬停宿主才浮现；小圆点 + 毛玻璃 + 低对比 */
    .donmai-dl-btn {
      position: absolute; right: 6px; bottom: 6px; z-index: 20;
      width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
      font-size: 11px; line-height: 1; border-radius: 9999px; cursor: pointer;
      background: rgba(18, 20, 26, .38); color: rgba(255, 255, 255, .82);
      border: 1px solid rgba(255, 255, 255, .14);
      opacity: 0; transform: scale(.9); pointer-events: none;
      transition: opacity .18s ease, transform .18s ease, background .18s ease;
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      text-decoration: none !important; user-select: none;
    }
    .donmai-dl-anchor:hover .donmai-dl-btn,
    section.image-container:hover .donmai-dl-btn { opacity: .8; pointer-events: auto; }
    .donmai-dl-btn:hover { opacity: 1 !important; background: rgba(18, 20, 26, .72); transform: scale(1); }
    .donmai-dl-btn.loading { opacity: .8; pointer-events: none; animation: donmai-dl-pulse 1s ease-in-out infinite; }
    @keyframes donmai-dl-pulse { 50% { transform: scale(.85); } }
    @media (hover: none) { .donmai-dl-btn { opacity: .65; pointer-events: auto; } }
    .donmai-dl-anchor { position: relative; display: block; }
    /* 详情页 Size 行：弱化的文字链风格，不抢视觉 */
    #post-info-size .donmai-dl-btn-inline {
      margin-left: 6px; font-size: 12px; padding: 0 2px; cursor: pointer;
      background: none; border: none; color: inherit; opacity: .5; text-decoration: underline dotted;
    }
    #post-info-size .donmai-dl-btn-inline:hover { opacity: 1; }
  `);

  /* ---------- 可配下载位置 ---------- */
  // 说明：浏览器安全限制下，油猴脚本无法指定磁盘绝对路径。
  // GM_download 的 name 支持相对子目录（如 "donmai/xxx.jpg"），文件会落在
  // 浏览器默认下载目录下的该子文件夹里；这就是本脚本的“默认下载位置”。
  const CFG = {
    dir: GM_getValue('dl_dir', 'donmai'),          // 下载子目录，为空 = 直接放下载根目录
    tpl: GM_getValue('name_tpl', '{tag}_{id}'),    // 文件名模板，支持 {tag} {id}
    saveAs: GM_getValue('save_as', false),         // 每次下载都弹出另存为对话框
    autoFav: GM_getValue('auto_fav', true),          // 点击下载时自动收藏该图
  };

  function sanitizeDir(d) {
    return String(d || '')
      .replace(/\\/g, '/').split('/')
      .map(s => s.replace(/[\0-\x1f<>:\"|?*]+/g, '').trim().replace(/^\.+$/, ''))
      .filter(s => s && s !== '.' && s !== '..')
      .slice(0, 5).join('/');
  }

  function examplePath() {
    const dir = sanitizeDir(CFG.dir);
    const name = CFG.tpl.replace('{tag}', currentTag()).replace('{id}', '10855187') + '.jpg';
    return (dir ? dir + '/' : '') + name;
  }

  function registerMenu() {
    try {
      GM_registerMenuCommand('⚙ 设置下载子目录（当前: ' + (sanitizeDir(CFG.dir) || '(根目录)') + '）', () => {
        const v = prompt('下载子目录（相对浏览器默认下载目录，可多级如 donmai/neuro-sama，留空=根目录）:', CFG.dir);
        if (v === null) return;
        CFG.dir = v;
        GM_setValue('dl_dir', v);
        alert('已保存，之后文件如：' + examplePath());
      });
      GM_registerMenuCommand('⚙ 设置文件名模板（当前: ' + CFG.tpl + '）', () => {
        const v = prompt('文件名模板，支持 {tag} {id}，扩展名自动追加:', CFG.tpl);
        if (v === null || !v.trim()) return;
        CFG.tpl = v.trim();
        GM_setValue('name_tpl', CFG.tpl);
        alert('已保存，示例：' + examplePath());
      });
      GM_registerMenuCommand('⚙ 下载时自动收藏（当前: ' + (CFG.autoFav ? '开' : '关') + '）', () => {
        CFG.autoFav = !CFG.autoFav;
        GM_setValue('auto_fav', CFG.autoFav);
        alert('下载时自动收藏：' + (CFG.autoFav ? '开' : '关'));
      });
      GM_registerMenuCommand('⚙ 下载时询问保存位置（当前: ' + (CFG.saveAs ? '开' : '关') + '）', () => {
        CFG.saveAs = !CFG.saveAs;
        GM_setValue('save_as', CFG.saveAs);
        alert('每次询问保存位置：' + (CFG.saveAs ? '开' : '关'));
      });
    } catch (_) { /* 非 Tampermonkey 环境忽略 */ }
  }

  const fileUrlCache = new Map(); // id -> file_url

  function currentTag() {
    const m = location.search.match(/[?&](?:tags|q)=([^&]*)/);
    if (m) {
      const first = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim().split(/\s+/)[0];
      if (first) return first.replace(/[^\w\-.()]+/g, '_');
    }
    return 'neuro-sama';
  }

  function fileName(id, fileUrl) {
    const ext = (fileUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
    const base = CFG.tpl.replace('{tag}', currentTag()).replace('{id}', String(id))
      .replace(/[\\/:*?"<>|]/g, '_').trim() || `${currentTag()}_${id}`;
    const dir = sanitizeDir(CFG.dir);
    return (dir ? dir + '/' : '') + `${base}.${ext}`;
  }

  function triggerDownload(url, name) {
    // 优先 GM_download（可跨域到 cdn.donmai.us，需 @connect 放行）
    try {
      if (typeof GM_download === 'function') {
        GM_download({ url, name, saveAs: !!CFG.saveAs });
        return;
      }
    } catch (_) { /* fallthrough */ }
    // 降级：同页 <a download>，跨域时浏览器可能忽略 download 属性而直接打开
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function resolveFileUrl(id) {
    if (fileUrlCache.has(id)) return fileUrlCache.get(id);
    const r = await fetch(`/posts/${id}.json`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('json status ' + r.status);
    const d = await r.json();
    if (!d.file_url) throw new Error('empty file_url');
    fileUrlCache.set(id, d.file_url);
    return d.file_url;
  }

  function makeBtn(title) {
    const b = document.createElement('a');
    b.className = 'donmai-dl-btn';
    b.textContent = '↓';
    b.title = title || '下载原图';
    b.href = 'javascript:void(0)';
    return b;
  }

  /* ---------- 自动收藏 ----------
   * 真实 DOM（登录态实测）：li#post-option-add-to-favorites > a#add-to-favorites[href="/favorites?post_id=ID"]（未收藏时可见）
   * li#post-option-remove-from-favorites > a#remove-from-favorites[href="/favorites/ID"]（已收藏时可见）
   * 接口：POST /favorites?post_id=ID → 201；重复收藏 → 422（无副作用）；未登录 → 401/302。均静默处理，绝不阻塞下载。
   */
  function isDetailFavorited() {
    const rm = document.querySelector('#remove-from-favorites');
    return !!rm && getComputedStyle(rm).display !== 'none';
  }

  function syncDetailFavUI() {
    const add = document.querySelector('#add-to-favorites');
    const rm = document.querySelector('#remove-from-favorites');
    if (add) add.style.display = 'none';
    if (rm) rm.style.display = '';
    const cnt = document.querySelector('.post-favcount a');
    if (cnt && /^\d+$/.test(cnt.textContent.trim())) cnt.textContent = String(Number(cnt.textContent.trim()) + 1);
  }

  async function autoFav(id, btn) {
    if (!CFG.autoFav) return;
    try {
      // 详情页可用 DOM 直接判断，避免重复请求
      if (document.querySelector('#post-options') && isDetailFavorited()) return;
      const token = document.querySelector('meta[name=csrf-token]')?.content;
      if (!token) return; // 无 token = 未登录或异常页，静默跳过
      const r = await fetch(`/favorites?post_id=${id}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'X-CSRF-Token': token, 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
      });
      if (r.status === 201 || r.status === 200) {
        if (btn) { const old = btn.textContent; btn.textContent = '♥'; setTimeout(() => { btn.textContent = old; }, 1500); }
        if (document.querySelector('#post-options')) syncDetailFavUI();
      }
      // 422 已收藏 / 401 未登录 / 其他：全部静默，不管
    } catch (_) { /* 网络异常静默，下载不受影响 */ }
  }

  async function downloadById(id, btn) {
    btn.classList.add('loading');
    autoFav(id, btn); // 与下载并行，不阻塞
    try {
      const url = await resolveFileUrl(id);
      triggerDownload(url, fileName(id, url));
    } catch (e) {
      // 降级：直接用缩略图
      const img = document.querySelector(`article.post-preview[data-id="${id}"] img`);
      if (img) triggerDownload(img.src, fileName(id, img.src));
      else alert('下载失败: ' + e.message);
    } finally {
      btn.classList.remove('loading');
    }
  }

  // ---------- 列表页 ----------
  function enhanceList() {
    document.querySelectorAll('article.post-preview[data-id]').forEach((art) => {
      if (art.dataset.dlDone) return;
      art.dataset.dlDone = '1';
      const id = art.dataset.id || art.getAttribute('data-id');
      const anchor = art.querySelector('a.post-preview-link') || art;
      anchor.classList.add('donmai-dl-anchor');
      if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
      const btn = makeBtn(`下载原图 #${id}`);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        downloadById(id, btn);
      });
      anchor.appendChild(btn);
    });
  }

  // ---------- 详情页 ----------
  function enhanceDetail() {
    // 1) Size 行内按钮：li#post-info-size > a[href*=cdn.donmai.us/original]
    const sizeLink = document.querySelector('#post-info-size a[href*="cdn.donmai.us"]');
    const m = location.pathname.match(/\/posts\/(\d+)/);
    const id = m ? m[1] : null;
    if (sizeLink && id && !sizeLink.dataset.dlDone) {
      sizeLink.dataset.dlDone = '1';
      const b = document.createElement('button');
      b.className = 'donmai-dl-btn-inline';
      b.textContent = '↓原图';
      b.title = sizeLink.href;
      b.addEventListener('click', () => { autoFav(id, null); triggerDownload(sizeLink.href, fileName(id, sizeLink.href)); });
      sizeLink.after(b);
    }
    // 2) 大图右下角悬浮按钮：section.image-container[data-file-url] / img#image
    const wrap = document.querySelector('section.image-container');
    if (wrap && id && !wrap.dataset.dlDone) {
      wrap.dataset.dlDone = '1';
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      const direct = wrap.getAttribute('data-file-url') || sizeLink?.href;
      const btn = makeBtn(`下载原图 #${id}`);
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (direct) { autoFav(id, btn); triggerDownload(direct, fileName(id, direct)); }
        else await downloadById(id, btn);
      });
      wrap.appendChild(btn);
    }
  }

  function run() {
    enhanceList();
    enhanceDetail();
  }

  run();
  registerMenu();
  // 翻页 / 无限滚动 / pjax
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
})();
