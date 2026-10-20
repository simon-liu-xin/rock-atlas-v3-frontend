import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('the production SEO build publishes readable pages and only real canonical URLs', async () => {
  const output = await mkdtemp(join(tmpdir(), 'rock-atlas-seo-'));
  try {
    await writeFile(join(output, 'index.html'), await readFile('index.html', 'utf8'));
    execFileSync(process.execPath, ['scripts/build-seo.mjs', '--out', output]);
    const home = await readFile(join(output, 'index.html'), 'utf8');
    expect(home).toContain('rel="canonical" href="https://rock-atlas.simonliu.cn/"');
    expect(home).toContain('href="https://www.simonliu.cn/"');
    expect(home).toContain('"@type":"Person"');
    const schema = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)?.[1];
    expect(JSON.parse(schema!)).toMatchObject({ author: { '@id': 'https://www.simonliu.cn/#person' } });
    const digest = createHash('sha256').update(schema!).digest('base64');
    expect(home).toContain(`'sha256-${digest}'`);
    const manifest = JSON.parse(await readFile(join(output, 'seo-manifest.json'), 'utf8'));
    expect(manifest.pages.map((page: { canonical: string }) => page.canonical)).toEqual([
      'https://rock-atlas.simonliu.cn/',
      'https://rock-atlas.simonliu.cn/guide/',
      'https://rock-atlas.simonliu.cn/catalog/',
      'https://rock-atlas.simonliu.cn/zh/guide/',
      'https://rock-atlas.simonliu.cn/zh/catalog/',
    ]);
    for (const path of ['guide', 'catalog', 'zh/guide', 'zh/catalog']) {
      const html = await readFile(join(output, path, 'index.html'), 'utf8');
      expect(html).toContain('<h1>');
      expect(html).toContain('href="https://www.simonliu.cn/"');
      expect(html).toContain(`rel="canonical" href="https://rock-atlas.simonliu.cn/${path}/"`);
    }
    const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
    expect(sitemap.match(/<loc>/g)).toHaveLength(5);
    const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]!);
    expect(locations.every(url => !/experiment|evidence|\?|404/.test(url))).toBe(true);
    expect(await readFile(join(output, 'robots.txt'), 'utf8')).toContain('Sitemap: https://rock-atlas.simonliu.cn/sitemap.xml');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
