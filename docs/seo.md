# SEO 与可抓取内容

生产域名为 `https://rock-atlas.simonliu.cn/`。Cloudflare 插件确认本项目采用 Pages 直接上传，GitHub 提交不会自动发布。

`npm run build` 在 Vite 构建后执行 `scripts/build-seo.mjs`，从当前快照生成首页静态说明、英文及中文使用指南与风格目录。构建会验证 manifest 和 overview 哈希，不手工填写覆盖数量。React 加载后继续使用原有交互星图；关闭 JavaScript 仍可阅读说明和目录。

- 首页 canonical 固定为生产根地址，探索查询参数不形成独立站点地图页面。
- `/guide/` 与 `/zh/guide/`、`/catalog/` 与 `/zh/catalog/` 是完整语言配对，具有互相对应的 hreflang。
- `sitemap.xml` 只列出五个正式页面；实验、证据兼容路由和原始数据资源通过响应头声明 noindex。
- 首页生成的 JSON-LD 通过内容哈希加入原有 CSP，不开放任意内联脚本。
- `pages.dev` 使用 noindex 与生产 canonical，避免重复收录。
- 静态目录中的名称、关联数量、来源与缺失状态取自当前发布快照。目录数量不表示全世界音乐的完整覆盖，视觉连线不证明历史影响。

发布前运行 `npm run check` 和现有 Cloudflare 发布完整性检查，确认已授权音频仍存在。正式部署前可用预览分支验证。发布后检查首页、两种语言的指南与目录、robots、sitemap、404 以及目录跳入星图的选择行为。

Google Search Console 的 `simonliu.cn` 域名资源可以提交 `https://rock-atlas.simonliu.cn/sitemap.xml`；Bing 使用同一地址。实际提交需在对应账号中操作。
