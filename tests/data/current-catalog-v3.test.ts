import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { StaticShardedCatalogRepository, type BrowserCatalogSigningKey } from '../../src/data/catalog/static-sharded-catalog-repository.ts';
import { CatalogUniverseController } from '../../src/data/catalog/catalog-universe-controller.ts';
import { initialUniverseState } from '../../src/app/experiment/universe-navigation.ts';

async function currentController(intercept?: (url: string, bytes: Buffer) => Promise<Buffer>) {
  const requests: string[] = [];
  const keys = JSON.parse(await readFile('src/data/catalog/trusted-catalog-keys.json', 'utf8')) as Record<string, BrowserCatalogSigningKey>;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input); requests.push(url);
    let bytes: Buffer = await readFile(`public${url}`);
    if (intercept) bytes = await intercept(url, bytes);
    return new Response(new Uint8Array(bytes));
  };
  const repository = new StaticShardedCatalogRepository(fetcher, keys);
  const controller = new CatalogUniverseController(repository, () => {});
  return { controller, requests };
}

describe('current SQL corpus served through V3', () => {
  test('opens overview without eager artist/album namespaces and reports canonical counts', async () => {
    const { controller, requests } = await currentController();
    try {
      await controller.open('');
      expect(controller.getSnapshot().error).toBeNull();
      expect(controller.getSnapshot().model?.counts).toEqual({ styles: 828, artists: 420, release_groups: 528, relations: 997 });
      expect(controller.getSnapshot().preserved_artist_count).toBe(100);
      expect(controller.getSnapshot().model?.artists).toEqual([]);
      expect(requests).toHaveLength(3);
      expect(requests.every((url) => url.startsWith('/data/rock-catalog-v3/'))).toBe(true);
      await controller.select({ ...initialUniverseState, focus_id: 'mw:style:grunge', artist_id: 'mw:artist:nirvana' });
      expect(controller.getSnapshot().model?.artists.map((row) => row.canonical_name)).toEqual(['Alice in Chains', 'Mudhoney', 'Nirvana', 'Pearl Jam', 'Soundgarden']);
      expect(controller.getSnapshot().model?.release_groups.map((row) => row.canonical_name)).toEqual(['Bleach', 'Nevermind']);
      expect(controller.getSnapshot().model?.styles).toHaveLength(828);
    } finally { controller.dispose(); }
  });

  test('keeps the map after a failed detail hash and supports retry', async () => {
    let corrupt = true;
    const { controller } = await currentController(async (url, bytes) =>
      corrupt && url.includes('/manifests/style-artists/') ? Buffer.from('{}') : bytes);
    try {
      await controller.open('');
      await controller.select({ ...initialUniverseState, focus_id: 'mw:style:grunge' });
      expect(controller.getSnapshot().error).toMatch(/hash mismatch/);
      expect(controller.getSnapshot().model?.styles).toHaveLength(828);
      corrupt = false;
      await controller.retry();
      expect(controller.getSnapshot().error).toBeNull();
      expect(controller.getSnapshot().model?.artists).toHaveLength(5);
    } finally { controller.dispose(); }
  });

  test('late style responses cannot overwrite a newer selection', async () => {
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => { unlock = resolve; });
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    const { controller } = await currentController(async (url, bytes) => {
      if (url.includes('/manifests/style-artists/')) { started(); await gate; }
      return bytes;
    });
    try {
      await controller.open('');
      const first = controller.select({ ...initialUniverseState, focus_id: 'mw:style:grunge' });
      await pending;
      const second = controller.select({ ...initialUniverseState, focus_id: 'mw:style:heavy-metal' });
      unlock();
      await Promise.all([first, second]);
      expect(controller.getSnapshot().state.focus_id).toBe('mw:style:heavy-metal');
      expect(controller.getSnapshot().error).toBeNull();
      expect(controller.getSnapshot().model?.artists.every((row) => row.style_id === 'mw:style:heavy-metal')).toBe(true);
    } finally { unlock(); controller.dispose(); }
  });

  test('restores historical occurrence links by explicit canonical redirects', async () => {
    const { controller } = await currentController();
    try {
      await controller.open('?focus_id=mw%3Astyle%3Awikidata%3Aq107602122&artist_id=mw%3Agraph-artist%3Aq107602122%3Aq2831&release_group_id=mw%3Agraph-release-group%3Aq107602122%3Aq44320');
      expect(controller.getSnapshot().error).toBeNull();
      expect(controller.getSnapshot().model?.artists.find((row) => row.internal_id === controller.getSnapshot().state.artist_id)?.canonical_name).toBe('Michael Jackson');
      expect(controller.getSnapshot().model?.release_groups.find((row) => row.internal_id === controller.getSnapshot().state.release_group_id)?.canonical_name).toBe('Thriller');
      expect(controller.getSnapshot().state.artist_id).not.toContain('graph-artist');
    } finally { controller.dispose(); }
  });

  test('changing the query invalidates results that are still being fetched', async () => {
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => { unlock = resolve; });
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    const { controller } = await currentController(async (url, bytes) => {
      if (url.includes('/manifests/search-artist/')) { started(); await gate; }
      return bytes;
    });
    try {
      await controller.open('');
      const oldSearch = controller.search('Nirvana');
      await pending;
      controller.prepareSearch('Pink Floyd');
      unlock(); await oldSearch;
      expect(controller.getSnapshot().search_results).toEqual([]);
      await controller.search('Pink Floyd');
      expect(controller.getSnapshot().search_results.some((row) => row.name === 'Pink Floyd')).toBe(true);
      expect(controller.getSnapshot().search_results.every((row) => row.name !== 'Nirvana')).toBe(true);
    } finally { unlock(); controller.dispose(); }
  });
});
