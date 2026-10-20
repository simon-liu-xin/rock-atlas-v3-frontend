# Rock Atlas：Catalog V3 静态站点发布到 Cloudflare

## 当前发布范围

首页使用 `StaticShardedCatalogRepository`，从 `/data/rock-catalog-v3/current.json`
验签并锁定一个 generation。全局只加载概览；风格艺人、艺人专辑、风格关系与搜索
按需读取 V3 分片。数据库留在本机，Cloudflare 只接收 `dist/` 中的静态网站。

本次迁移的是现有受审 SQL 目录：828 个风格、420 位去重艺人、528 张专辑、
997 条关系；原有 100 位艺人保留。828 个代表艺人 occurrence 不等于 828 位
独立艺人。格式切换不代表已完成全量 MusicBrainz/Discogs 导入。

当前限定目录的 `gate_a.status` 为 `not-run`，全量发布的 Gate A 要求仍由
全量流水线执行。发布脚本不会下载数据，也不会绕过全量发布门禁。

## 一键发布

### Git integration 构建设置

正式站点为 `https://rock-atlas.simonliu.cn`，Pages 项目为 `rock-atlas`，源仓库
为 `simon-liu-xin/rock-atlas-v3-frontend`，生产分支为 `main`。项目根目录使用本仓根目录，
构建命令必须为 `npm run build`，构建输出目录必须为 `dist`，Node 使用 22。
只修改仓库文件不会自动纠正控制台中为空的构建设置，应另行核对项目设置后触发部署。

不能将原始仓库根目录直接作为静态输出：它只包含应用入口，SEO 元数据、静态正文、
robots 与 sitemap 均由构建步骤生成；`public/404.html` 也要复制到输出根目录，
才能使未知路径返回 404。发布完成后运行 `npm run seo:audit`，并独立检查随机未知
路径确实返回 404。线上 HTTP 200 的首页外壳不能当作 sitemap 或 robots 验收通过。

### 手动上传

Mac、Windows PowerShell 和 Linux 使用相同命令。在项目或 `rock-atlas-V3-clean`
目录中执行，前置条件是 Node.js 22.18+（保持 Node 22）和 npm 10.9+：

```bash
npm ci
npm run deploy:cloudflare -- --project rock-atlas
```

脚本依次构建网站、校验 V3 数据和 Pages 限制、核对账号、创建缺失项目、上传完整
`dist/`。固定使用 Wrangler 4.149.0，首次使用时 npm 会获取该工具。交互终端中
未登录会打开 Cloudflare 登录流程；已登录后再次运行即可发布。

在 CI 或没有交互终端时，先配置 `CLOUDFLARE_ACCOUNT_ID` 和
`CLOUDFLARE_API_TOKEN`。Token 应限定到目标账号并具备 Pages 发布权限；不要
把它们放进 `VITE_*`、源码、JSON 或 `public/`。

需要先单独登录时：

```bash
npm exec --yes --package=wrangler@4.149.0 -- wrangler login
```

脚本默认项目名 `rock-atlas`、生产分支 `main`。上传后以 Wrangler 实际返回的部署
URL 为准。现有项目的生产分支必须在配置中与控制台保持一致：Wrangler 的项目列表
JSON 不返回生产分支，脚本不会擅自修改现有项目设置。

## 预览与本地检查

```bash
# 构建并完整检查；不登录、不创建项目、不上传
npm run deploy:cloudflare:check

# 发布 preview 分支
npm run deploy:cloudflare:preview -- --project rock-atlas

# 发布指定分支
npm run deploy:cloudflare -- --project rock-atlas --branch release-preview

# 检查现有 dist，不重复构建
npm run deploy:cloudflare:check -- --skip-build
```

`--skip-build` 仍校验签名、所有活动分片和构建内的公钥摘要；轮换签名公钥后必须
重新构建。发布失败会以非零退出码停止。账号查询失败不会被当作“项目不存在”。

可复制 `cloudflare.deploy.example.json` 为 `cloudflare.deploy.json`，修改项目名与
分支。这个本机配置已被 Git 忽略。可选 `account_id` 为账号 ID，不能存 Token。
命令行项目名、分支覆盖配置；`--preview` 的分支必须不同于生产分支。

## 发布前的自动检查

- 页面、404 页、Pages 路由和缓存文件存在。
- `current.json` 的 Ed25519 签名、兼容 schema、公钥与构建产物一致。
- root、概览、递归 namespace manifest 和全部活动对象的大小、哈希、计数一致。
- 12 个 namespace 完整，概览覆盖所有风格并保留布局。
- `dist/` 没有旧 V2 运行目录、SQL、原始 JSONL、私钥、环境文件或数据库目录。
- 默认最多 20,000 个文件，单文件最多 25 MiB；超限立即停止上传。

`npm run check` 另外验证 SEO 生成器在独立输出目录中的产物，覆盖公开页清单、
canonical、来源可读正文、作者与主站回链。`npm run test:e2e` 覆盖动态查询及研究
工作台的客户端 `noindex`。`/experiment/*`、`/evidence/*` 还通过 `_headers` 返回
`X-Robots-Tag`；查询参数页的原始 HTML 使用首页 canonical，客户端再标记 `noindex`。
这些页面不能加入 sitemap；不要通过 robots 禁抓取替代 `noindex`。

付费项目确认启用更高文件数后可使用 `--file-limit 100000`；该参数只改变本地
检查，不会替账号升级套餐。需要在项目设置核对相应限制及
`PAGES_WRANGLER_MAJOR_VERSION=4`。拖放上传的文件上限更低，不适合作为全量
数据的默认发布方式。[Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)

## 路由、缓存和 gzip

`public/_headers`、`public/_redirects`、`public/404.html` 已随包提供，构建时自动
复制到 `dist/`。`/experiment/*` 和 `/evidence/*` 重写到首页；缺失 JSON、JS
与字体返回 404，不能返回首页 HTML。

`current.json` 使用 `no-cache, must-revalidate`，generation 与内容寻址对象使用
一年 `immutable` 缓存。`.json.gz` 以 `Content-Type: application/gzip` 返回，
不设置 `Content-Encoding: gzip`，因为读取层先验证原始 gzip 字节再显式解压。
本地 Vite dev/preview 也按同一规则提供数据。

不要额外为 `/*` 设置 Cache-Control，否则 Pages 可能合并多条规则，使指针与
不可变对象的缓存策略冲突。[Headers](https://developers.cloudflare.com/pages/configuration/headers/)、
[Redirects](https://developers.cloudflare.com/pages/configuration/redirects/)

## 音频与构建变量

`VITE_BACKGROUND_TRACK_URL` 是构建时变量，使用随站音频时设置成 `/audio/文件名.mp3`。
置空只关闭播放器，不会移除 `public/audio/` 中的文件；不发布音频时应在构建
副本中将文件移到包外。上传脚本会检查音频单文件大小。Direct Upload 不会根据
Cloudflare 控制台变量重新构建网站。

## SQL 数据更新后重新发布

当前限定目录的更新顺序：

```bash
# 从已受审的 SQL generation 导出；需要本机 PostgreSQL/Docker
npm run data:catalog:postgres

# 把当前 canonical 与 SQL 导出投影迁移为 V3 分片，原子切换指针
npm run data:catalog:v3

# 先预览验收，再发布生产
npm run deploy:cloudflare:preview -- --project rock-atlas
npm run deploy:cloudflare -- --project rock-atlas
```

`data:catalog:v3` 校验 SQL 输出 manifest 和哈希，不抓取网络数据。默认签名私钥
首次生成在用户主目录下 `.local/share/rock-atlas/current-catalog-v3.pem`；Mac/Linux
权限为 0600，Windows 需检查用户目录 ACL。密钥不在仓库中；可用
`ROCK_ATLAS_SIGNING_KEY` 指向外部 Ed25519 PEM。可信公钥更新
在 `src/data/catalog/trusted-catalog-keys.json`，它属于前端构建输入。

全量目录继续使用 [全量静态流水线](../data/full-static-catalog-pipeline.md)，不能把
限定目录迁移脚本当作全量下载器。全量 publisher 使用的 key_id 与可信公钥也必须
加入前端信任配置，再构建和运行发布检查。

每次上传整个静态快照，不能仅上传 `current.json`。保留活动浏览器可能仍在读取
的旧 generation 与对象。页面在会话中固定 generation，刷新后读取新指针，避免
一次浏览混用新旧分片。

## 发布验收与回滚

在 Wrangler 返回的 HTTPS 地址检查：首页非空，搜索、风格→艺人→专辑、刷新深链、
返回全局与手势可用；控制台没有数据哈希、schema 或脚本错误。

```bash
curl -I https://rock-atlas.pages.dev/data/rock-catalog-v3/current.json
curl -I https://rock-atlas.pages.dev/data/rock-catalog-v3/missing-for-check.json
```

第二个请求应返回 404。对象 URL 从 root manifest 取得，响应应为原始 gzip，
不带 Content-Encoding。实际域名以部署结果为准。

回滚在 Pages 的 Deployments 中选择以前成功的生产部署，执行
“Rollback to this deployment”。页面、JS、公钥和 JSON 一起回滚，无需回滚 SQL。
[回滚说明](https://developers.cloudflare.com/pages/configuration/rollbacks/)

## 全量分片超过 Pages 限制时

当前同源 Pages 发布已实现。将数据独立放 R2 属于下一阶段：读取层的 pointer、
manifest、概览和 bucket 请求都需要统一解析到数据域名，同时配置 CORS、指针缓存
和单独的数据回滚。仅改 pointer URL 不够，manifest 内仍是根相对路径。超限时
脚本会停止，不会自动删数据、缩小数据范围或创建 R2。

Direct Upload 项目不能原地切换成 Git integration；要改为 Git 自动部署需另建
项目。[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

Cloudflare 的中国大陆访问表现仍需在目标网络实测。
