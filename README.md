# Rock Atlas V3 前端

React/Vite 星云图、风格/艺人/专辑交互、V3 签名静态数据读取、背景音频控件和
Cloudflare Pages 发布。当前随库数据是受审限定目录：828 个风格、420 位去重
艺人、528 张专辑、997 条关系，保留原有 100 位艺人；不是全量 MusicBrainz。

后端与 JSON 构建工具在相邻独立仓库。本仓库无需 SQL 即可运行。

```bash
npm ci
npm run dev
npm run check
```

生产发布：

```bash
npm run deploy:cloudflare:check
git push origin main
```

正式发布只推送 `simon-liu-xin/rock-atlas-v3-frontend`，由现有 Cloudflare Pages 项目 `rock-atlas` 自动构建同步；不在本机手动上传或创建另一份部署。详见 [Cloudflare 指引](docs/deployment/cloudflare-pages.md)。Cloudflare 只发布 `dist/`。

## SEO 与公开阅读页

`npm run build` 在 Vite 构建后生成可直接读取的首页介绍、英中使用说明和风格目录，
以及 `robots.txt`、`sitemap.xml`、`seo-manifest.json`。公开页面清单见 `site.json`。
生成器核对当前数据快照的 manifest 与概览哈希，不写入数据目录。动态搜索、
实体焦点和研究工作台不进入 sitemap；应用参数状态使用 `noindex`，canonical
统一回到首页。使用说明与目录有独立英中正文，不存在中文首页的占位 URL。

共享工具 `@simonliu/site-kit` 以 `vendor/` 中的版本化 tarball 安装；持续集成
只需本仓与 `npm ci`，无需访问作者博客仓库。修改中央工具后须重新打包并更新
本仓依赖、锁文件。正式上线后执行 `npm run seo:audit`，检查实际响应。

Cloudflare Git integration 必须设置构建命令 `npm run build`、输出目录 `dist`。
静态阅读页由生产构建生成，`npm run dev` 仅用于交互应用开发。

## 背景音乐

实际 MP3 不进入 Git。部署者将文件放在 `public/audio/comfortably-numb.mp3`，复制
`.env.production.example` 为 `.env.production.local`，再重新构建发布。
本地开发另在 `.env.local` 中设置相同 `VITE_BACKGROUND_TRACK_URL`。

页面主动以 50% 音量尝试播放；若浏览器拒绝有声自动播放，在首次点击、键盘或
触屏手势后恢复。不能用网页代码强制绕过浏览器策略。手动暂停后，其他交互不会
重新启动音乐，右下角原有控件负责播放和暂停。

## 数据更新

JSON builder 验证数据并同步 `public/data/rock-catalog-v3/` 和可信公钥后，在此仓库
重新构建发布。公钥变更必须构建 JS；指针和所有对象随网站一并发布。

浏览器回归：`npm run test:e2e`。覆盖按需加载、深链、手势、响应式、可访问性与
分片失败恢复。开发服务器默认 127.0.0.1；不会连接后端 SQL。

共享 schema 位于 `schemas/`。接口变化需同步三个仓库。源文件来源清单在
`SOURCE-MANIFEST.json`，当前修订见 `CHANGELOG.md`。
