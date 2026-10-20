import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { pageMetadata, renderPageHead, buildSiteFiles } from '@simonliu/site-kit';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(await readFile(resolve(root, 'site.json'), 'utf8'));
const { origin } = site;
const publicDir = resolve(root, 'public');
const outputFlag = process.argv.indexOf('--out');
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error('--out requires a directory');
const dist = resolve(root, outputFlag >= 0 ? process.argv[outputFlag + 1] : 'dist');
const pointer = JSON.parse(await readFile(resolve(publicDir, 'data/rock-catalog-v3/current.json'), 'utf8'));
const readAsset = async (url) => {
  const path = resolve(publicDir, `.${url}`);
  if (!path.startsWith(`${publicDir}/`)) throw new Error('Catalog URL escapes public directory');
  return readFile(path);
};
const manifestBytes = await readAsset(pointer.root_manifest_url);
if (createHash('sha256').update(manifestBytes).digest('hex') !== pointer.root_manifest_content_sha256)
  throw new Error('SEO catalog manifest hash mismatch');
const manifest = JSON.parse(manifestBytes);
const overviewBytes = await readAsset(manifest.overview.url);
if (createHash('sha256').update(overviewBytes).digest('hex') !== manifest.overview.content_sha256)
  throw new Error('SEO overview hash mismatch');
const { styles } = JSON.parse(overviewBytes);
const counts = manifest.counts.canonical;
const esc = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const englishDescription = 'Explore rock music genres, artists and releases through an interactive music map. Browse a source-linked style directory and distinguish documented relationships from inferred connections.';
const labels = (zh) => zh ? {
  home: '打开摇滚星图', guide: '使用与数据说明', catalog: '摇滚风格目录', language: 'English',
  title: '摇滚风格目录 — Rock Atlas', description: '浏览 Rock Atlas 当前快照中的摇滚风格、资料来源与关联艺人数，进入星图继续探索艺人和作品。',
} : {
  home: 'Open music map', guide: 'Guide & data sources', catalog: 'Rock style directory', language: '中文',
  title: 'Rock Music Genre Directory — Rock Atlas', description: 'Browse rock genres in the current Rock Atlas snapshot, with source links and associated artist counts. Continue into the interactive artist and release map.',
};
function head(title, description, path, zh, pair, kind = 'WebPage') {
  const metadata = pageMetadata({ origin, path, title, description, locale: zh ? 'zh-CN' : 'en',
    alternates: pair ? [{ locale: 'en', path: pair }, { locale: 'zh-CN', path: `/zh${pair}` }, { locale: 'x-default', path: pair }] : [] });
  const url = metadata.canonical;
  const author = { '@type': 'Person', '@id': 'https://www.simonliu.cn/#person', name: 'Simon Liu', url: 'https://www.simonliu.cn/about/' };
  const schema = { '@context': 'https://schema.org', '@type': kind, '@id': url + '#page', name: metadata.title, description: metadata.description, url, inLanguage: metadata.locale, author,
    isPartOf: { '@type': 'WebSite', '@id': origin + '/#website', name: site.name, url: origin + '/', publisher: author },
    ...(kind === 'WebApplication' ? { applicationCategory: 'EducationalApplication', operatingSystem: 'Web browser' } : {}),
  };
  const tags = renderPageHead({ origin, path, title, description, locale: metadata.locale,
    alternates: metadata.alternates, siteName: site.name, author: author.name, structuredData: schema,
  }).replace(/<title>[\s\S]*?<\/title>\n?/, '') + '<meta name="robots" content="index, follow">';
  const serializedSchema = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(tags)?.[1];
  if (!serializedSchema) throw new Error('Generated structured data missing');
  const hash = createHash('sha256').update(serializedSchema).digest('base64');
  return { metadata, hash, tags };
}
function identityLinks(zh) {
  return `<footer>Rock Atlas · Simon Liu · <a href="https://www.simonliu.cn/">${zh ? 'Simon 主站' : 'Simon’s home'}</a> · <a rel="author" href="https://blog.simonliu.cn/${zh ? '' : 'en/'}about/">${zh ? '关于作者' : 'About the author'}</a></footer>`;
}
const css = '<link rel="stylesheet" href="/seo.css">';
function nav(zh, section) {
  const t = labels(zh), prefix = zh ? '/zh' : '';
  return `<nav aria-label="${zh ? '阅读导航' : 'Reading navigation'}"><a href="/">${t.home}</a><a href="${prefix}/guide/">${t.guide}</a><a href="${prefix}/catalog/">${t.catalog}</a><a href="${zh ? '' : '/zh'}/${section}/" lang="${zh ? 'en' : 'zh-CN'}">${t.language}</a></nav>`;
}
function guide(zh) {
  return zh ? `<h1>Rock Atlas 摇滚星图：使用与数据说明</h1><p>Rock Atlas 是从音乐风格进入艺人、作品与关系证据的交互式探索工具。你可以沿星图逐层浏览，也可以先从<a href="/zh/catalog/">文字目录</a>选择一个风格。</p><h2>从一个风格开始</h2><ol><li>打开星图，通过 Styles、Artists 或顶部搜索找到感兴趣的名称。</li><li>选择风格后，查看相关艺人；选择艺人后继续查看作品和来源。</li><li>用 Relations 查看关系类型，用 Eras 缩小年代范围。返回总览可重新选择。</li><li>设备不支持 WebGL 或偏好文字阅读时，使用列表视图；动态效果和语言可在顶部切换。</li></ol><h2>关系意味着什么</h2><p>子风格、资料中记录的影响、风格共现和推断关系是不同的概念。画布距离不等于历史影响，共同标签也不能证明谁影响了谁。判断关系时应查看其类型、方向与证据链接，不应把每条连线理解为确定事实。</p><h2>来源与覆盖范围</h2><p>当前发布快照包含 ${counts.styles} 个风格、${counts.artists} 位艺人、${counts.release_groups} 个作品组。数据目录提供来源链接，相关实体资料涉及 Wikidata、MusicBrainz 和 Discogs；各来源适用各自许可。数量描述本站快照，不代表全球摇滚音乐的完整覆盖，也不保证所有关联均已完成审阅。</p><p>不同来源对名称、年代、地域与分类的定义可能不同。缺失资料会保留未知状态；本目录不是权威的音乐史结论。原始记录与后续研究可能修正现有认识。</p><h2>纠错与项目</h2><p>发现名称、年代或关系问题时，请提供实体名称、链接及可核查来源，通过<a href="https://github.com/simon-liu-xin/rock-atlas-v3-frontend">项目仓库</a>反馈。作者为 Simon Liu，更多研究与联系渠道见<a href="https://blog.simonliu.cn/about/">作者介绍</a>。</p>`
    : `<h1>Rock Atlas: music map guide and data sources</h1><p>Rock Atlas is an interactive way to explore rock styles, artists, releases and the evidence connecting them. Start with the map or choose a genre from the <a href="/catalog/">text directory</a>.</p><h2>Start with a style</h2><ol><li>Open the map and use Styles, Artists or search to find a name.</li><li>Select a style to explore its artists, then select an artist to view releases and sources.</li><li>Use Relations to inspect relationship types and Eras to narrow the period. Return to overview to start again.</li><li>Use the list view when WebGL is unavailable or you prefer text. Motion and language controls are available at the top.</li></ol><h2>Read relationships carefully</h2><p>Subgenre relationships, documented influences, shared tags and inferred connections mean different things. Distance on the canvas does not establish historical influence. Shared tags do not prove who influenced whom. Check each relationship’s type, direction and evidence rather than treating every connection as an established fact.</p><h2>Sources and coverage</h2><p>The current published snapshot contains ${counts.styles} styles, ${counts.artists} artists and ${counts.release_groups} release groups. Records link to sources, including Wikidata, MusicBrainz and Discogs, with their respective licenses. These counts describe this snapshot, not complete coverage of all rock music, and do not imply that every relationship has been reviewed.</p><p>Names, eras, regions and classifications can differ between sources. Missing information remains unknown. The directory is an exploration aid rather than an authoritative history; original records and later research may revise the picture.</p><h2>Corrections and project</h2><p>Report a name, era or relationship issue through the <a href="https://github.com/simon-liu-xin/rock-atlas-v3-frontend">project repository</a>, including the entity, URL and a verifiable source. The author is Simon Liu; see the <a href="https://blog.simonliu.cn/en/about/">author page</a> for further information and contact channels.</p>`;
}
function directory(zh) {
  const entries = [...styles].sort((a,b)=>a.name.localeCompare(b.name, 'en')).map(s=>{
    const query = new URLSearchParams({focus_id:s.entity_id}).toString();
    const source = /^https:\/\/www\.wikidata\.org\/wiki\/Special:EntityData\/(Q\d+)\.json$/.exec(s.source_url ?? '');
    const sourceUrl = source ? `https://www.wikidata.org/wiki/${source[1]}` : s.source_url;
    const link = /^https:\/\//.test(sourceUrl ?? '') ? `<a href="${esc(sourceUrl)}" rel="noreferrer noopener">${zh ? '资料来源' : 'Source record'}</a>` : '';
    return `<li><strong><a href="/?${esc(query)}">${esc(s.name)}</a></strong><small>${s.artist_count} ${zh ? '位关联艺人' : 'associated artists'}</small>${s.description ? `<p>${esc(s.description)}</p>` : ''}${link}</li>`;
  }).join('');
  return `<h1>${zh ? '摇滚风格目录' : 'Rock music genre directory'}</h1><p>${zh ? '本目录从当前发布快照生成。点击风格进入交互星图，继续查看艺人、作品和证据。关联艺人可能出现在多个风格中，因此分项数量不能直接相加。' : 'This directory is generated from the currently published snapshot. Choose a style to explore artists, releases and evidence in the interactive map. Artists can appear under multiple styles, so per-style counts are not additive.'}</p><p class="meta">${counts.styles} ${zh ? '个风格 · 快照发布于' : 'styles · Snapshot published'} ${esc(pointer.published_at.slice(0,10))}</p><p><a href="${zh ? '/zh' : ''}/guide/">${zh ? '先了解来源与关系边界' : 'Read about sources and relationship limitations'}</a></p><ul class="seo-directory">${entries}</ul>`;
}
const routes = ['/'];
const pages = [{ path: '/', title: 'Rock Atlas — Rock Music Genres, Artists & Connections', description: englishDescription, locale: 'en' }];
for (const zh of [false,true]) for (const section of ['guide','catalog']) {
  const path = `${zh ? '/zh' : ''}/${section}/`;
  const title = section === 'guide' ? (zh ? 'Rock Atlas 摇滚星图使用与数据说明' : 'Rock Atlas Guide — Music Map and Data Sources') : labels(zh).title;
  const description = section === 'guide' ? (zh ? '了解如何探索摇滚风格、艺人与作品，区分影响、子风格和共现关系，查看数据来源、覆盖范围与纠错渠道。' : 'Learn to explore rock styles, artists and releases, read relationship evidence, and understand the sources, coverage and limitations of the Rock Atlas music map.') : labels(zh).description;
  const meta = head(title,description,path,zh,`/${section}/`,section==='catalog'?'CollectionPage':'WebPage');
  const html = `<!doctype html><html lang="${zh ? 'zh-CN':'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(meta.metadata.title)}</title>${meta.tags}${css}<link rel="icon" href="/favicon.svg"></head><body><main class="seo-document">${nav(zh,section)}${section==='guide'?guide(zh):directory(zh)}${identityLinks(zh)}</main></body></html>`;
  await mkdir(resolve(dist,`.${path}`),{recursive:true});
  await writeFile(resolve(dist,`.${path}`,'index.html'),html);
  routes.push(path);
  pages.push({ path, title, description, locale: zh ? 'zh-CN' : 'en', alternates: meta.metadata.alternates });
}
const homeMeta = head('Rock Atlas — Rock Music Genres, Artists & Connections',englishDescription,'/',false,null,'WebApplication');
const landing = `<main class="seo-document"><h1>Rock Atlas: rock genres, artists and connections</h1><p>${esc(englishDescription)}</p><p>The current snapshot covers ${counts.styles} styles, ${counts.artists} artists and ${counts.release_groups} release groups. These are snapshot counts, not a claim of complete global coverage.</p><nav><a href="/catalog/">Browse the rock genre directory</a><a href="/guide/">Guide and data sources</a><a href="/zh/guide/" lang="zh-CN">中文使用说明</a></nav><p>The interactive map loads here when JavaScript is available. The text directory and guide remain available without JavaScript.</p>${identityLinks(false)}</main>`;
let homepage=await readFile(resolve(dist,'index.html'),'utf8');
if(!homepage.includes('<!-- seo:head -->')||!homepage.includes('<!-- seo:landing -->')) throw new Error('SEO build markers missing');
homepage=homepage.replace('<!-- seo:head -->',homeMeta.tags+css).replace('<!-- seo:landing -->',landing);
// Allow only the generated structured-data block under the existing strict CSP.
homepage=homepage.replace("script-src 'self';",`script-src 'self' 'sha256-${homeMeta.hash}';`);
await writeFile(resolve(dist,'index.html'),homepage);
if (JSON.stringify(routes) !== JSON.stringify(site.pages)) throw new Error('Generated pages do not match site.json');
await buildSiteFiles({ ...site, pages }, dist);
console.log(`SEO: ${routes.length} canonical pages; ${styles.length} source-linked styles; static landing verified.`);
