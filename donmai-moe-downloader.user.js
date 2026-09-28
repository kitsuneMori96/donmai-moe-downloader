// ==UserScript==
// @name         Donmai.moe 一键下载原图
// @namespace    https://github.com/kitsuneMori96/donmai-moe-downloader
// @version      0.1.0
// @description  列表页缩略图右下角加下载按钮（下载原图），详情页大图角落 + Information Size 行加按钮，文件名 tag_ID.扩展名
// @author       kitsuneMori96
// @match        https://donmai.moe/posts*
// @match        https://donmai.moe/posts/*
// @grant        GM_download
// @grant        GM_addStyle
// @connect      donmai.moe
// @connect      cdn.donmai.us
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* 真实 DOM（2026-09-28 有头 Chrome 实测）：
   * 列表: .posts-container > article.post-preview[data-id="10872602"] > div.post-preview-container
   *       > a.post-preview-link[href="/posts/ID"] > picture > img.post-preview-image[src=180x180预览]
   *       注：缩略图 img 无原图地址，必须调 /posts/:id.json 取 file_url
   * 详情: section#post-information > ul > li#post-info-size >
   *       <a href="https://cdn.donmai.us/original/..jpg">3.95 MB .jpg</a>(2880x1620)
   *       大图: section.image-container.note-container[data-id][data-file-url] > picture > img#image
   *       JSON: /posts/:id.json -> {file_url, large_file_url, preview_file_url, file_ext}
   */

  GM_addStyle(`
    .donmai-dl-btn {
      position: absolute; right: 4px; bottom: 4px; z-index: 50;
      width: 24px; height: 24px; line-height: 24px; text-align: center;
      font-size: 14px; border-radius: 6px; cursor: pointer;
      background: rgba(0,0,0,.65); color: #fff; border: 1px solid rgba(255,255,255,.35);
      text-decoration: none !important; user-select: none;
    }
    .donmai-dl-btn:hover { background: rgba(20,120,255,.9); }
    .donmai-dl-btn.loading { pointer-events: none; opacity: .6; }
    .donmai-dl-anchor { position: relative; display: block; }
    #post-info-size .donmai-dl-btn-inline {
      margin-left: 6px; font-size: 12px; padding: 0 6px; border-radius: 4px;
      background: #2b6cb0; color: #fff; cursor: pointer; border: none;
    }
  `);

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
    return `${currentTag()}_${id}.${ext}`;
  }

  function triggerDownload(url, name) {
    // 优先 GM_download（可跨域到 cdn.donmai.us，需 @connect 放行）
    try {
      if (typeof GM_download === 'function') {
        GM_download({ url, name, saveAs: false });
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
    b.textContent = '⬇';
    b.title = title || '下载原图';
    b.href = 'javascript:void(0)';
    return b;
  }

  async function downloadById(id, btn) {
    btn.classList.add('loading');
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
      b.textContent = '⬇下载原图';
      b.title = sizeLink.href;
      b.addEventListener('click', () => triggerDownload(sizeLink.href, fileName(id, sizeLink.href)));
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
        if (direct) triggerDownload(direct, fileName(id, direct));
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
  // 翻页 / 无限滚动 / pjax
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
})();
