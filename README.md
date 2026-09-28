# donmai-moe-downloader

Tampermonkey 油猴脚本：给 `donmai.moe` 加一键下载原图按钮。

## 功能

- 列表页（`/posts?tags=...`）：每张缩略图右下角悬停浮现的半透明小圆点 `↓`，点击通过 `/posts/:id.json` 取 `file_url` 下载**原图**（不跳转详情页），同时**自动收藏**该图（按钮短暂变 `♥` 反馈）。
- 详情页（`/posts/:id`）：大图右下角同款悬浮按钮 + `Information > Size` 行内弱化文字链 `↓原图`，直链即 `#post-info-size a[href*=cdn.donmai.us]`，同样自动收藏并同步页面心形/收藏数。
- 默认下载位置：Tampermonkey 菜单可设**下载子目录**（如 `donmai/neuro-sama`，文件落在浏览器默认下载目录下的该子文件夹；浏览器安全限制，脚本无法指定磁盘绝对路径）、**文件名模板**（`{tag}_{id}`，默认 `neuro-sama_10855187.jpg`）、**每次询问保存位置**开关。

## 真实 DOM（Cloudflare 后实测）

- 列表：`.posts-container > article.post-preview[data-id] > div.post-preview-container > a.post-preview-link > picture > img.post-preview-image`（仅 180x180 预览，原图走 JSON API）
- 详情：`li#post-info-size > a[href=https://cdn.donmai.us/original/...]`；大图 `section.image-container[data-file-url] > picture > img#image`
- JSON：`/posts/:id.json → { file_url, large_file_url, preview_file_url, file_ext }`

## 自动收藏

- 点击任何下载按钮时并行 `POST /favorites?post_id=ID`（`201` 成功；`422` 重复收藏无副作用；未登录 `401` 静默跳过），**绝不阻塞下载**。
- 详情页通过 `#remove-from-favorites` 可见性判断已收藏直接跳过；列表页重复 POST 由服务端判重，安全。
- Tampermonkey 菜单「下载时自动收藏」默认开，可随时关闭。
- 需浏览器已登录 donmai.moe，未登录时仅下载、不报错。

## 安装

1. 装 Tampermonkey → 新建脚本 → 粘贴 `donmai-moe-downloader.user.js` → 保存启用。
2. `@connect donmai.moe / cdn.donmai.us` 已声明；首次多文件下载按浏览器提示允许。

## 本地验证（WSL 有头 Chrome，remote-debugging 9222）

- `article.post-preview` 20/页 → 按钮 20 个；点击经 JSON 拿到 `original/...jpg`，文件名 `neuro-sama_10872602.jpg`。
- 详情 `10855187` Size 行按钮 + 大图按钮均存在，点击直下 `neuro-sama_10855187.jpg`。
