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
