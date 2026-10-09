import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { canonicalJsonV1 } from '../../src/data/contracts/catalog-v3.ts';

const cliModule = '../../scripts/deploy-cloudflare.mjs';
const verifierModule = '../../scripts/lib/cloudflare-static-publication.mjs';
const { deployCloudflare } = await import(cliModule);
const { verifyCloudflarePublication } = await import(verifierModule);
const report = { generation_id: 'test', files: 206 };

describe('Cloudflare one-command publisher', () => {
  test('dry-run builds and verifies, without login, project creation or upload', async () => {
    const commands: string[][] = [];
    const result = await deployCloudflare(['--dry-run'], {
      run: async (args: string[]) => { commands.push(args); return { stdout: '', stderr: '' }; },
      verify: async () => report,
    });
    expect(result).toEqual(report);
    expect(commands).toEqual([['run', 'build']]);
  });
  test('failed local verification stops before any Cloudflare command', async () => {
    const commands: string[][] = [];
    await expect(deployCloudflare(['--skip-build'], {
      run: async (args: string[]) => { commands.push(args); return { stdout: '', stderr: '' }; },
      verify: async () => { throw new Error('Corrupted catalog'); },
    })).rejects.toThrow('Corrupted catalog');
    expect(commands).toEqual([]);
  });
  test('recognizes Wrangler display-key JSON and uploads to the selected preview branch', async () => {
    const commands: string[][] = [];
    await deployCloudflare(['--skip-build', '--preview'], {
      verify: async () => report,
      run: async (args: string[]) => {
        commands.push(args);
        return { stdout: args.includes('list') ? JSON.stringify([{ 'Project Name': 'rock-atlas', 'Git Provider': 'No' }]) : '{"loggedIn":true}', stderr: '' };
      },
    });
    expect(commands.some((args) => args.includes('create'))).toBe(false);
    const upload = commands.at(-1)!;
    expect(upload).toContain('deploy');
    expect(upload.slice(upload.indexOf('--branch'), upload.indexOf('--branch') + 2)).toEqual(['--branch', 'preview']);
  });
  test('creates a missing project before uploading, and stops on account-access errors', async () => {
    const commands: string[][] = [];
    const run = async (args: string[]) => { commands.push(args); return { stdout: args.includes('list') ? '[]' : '{}', stderr: '' }; };
    await deployCloudflare(['--skip-build'], { run, verify: async () => report });
    expect(commands.findIndex((args) => args.includes('create'))).toBeLessThan(commands.findIndex((args) => args.includes('deploy')));
    commands.length = 0;
    await expect(deployCloudflare(['--skip-build'], { verify: async () => report,
      run: async (args: string[]) => { commands.push(args); if (args.includes('list')) throw new Error('API access denied'); return { stdout: '{}', stderr: '' }; },
    })).rejects.toThrow('API access denied');
    expect(commands.some((args) => args.includes('create') || args.includes('deploy'))).toBe(false);
  });
  test('rejects unsafe names before building or authenticating', async () => {
    await expect(deployCloudflare(['--project', 'rock;echo secret'])).rejects.toThrow('Invalid Pages project');
  });
  test('checks Pages size and file limits before reading a catalog', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rock-atlas-pages-test-'));
    try {
      await writeFile(join(dir, 'huge.bin'), Buffer.alloc(25 * 1024 * 1024 + 1));
      await expect(verifyCloudflarePublication({ dist: dir, trustedKeys: {} })).rejects.toThrow('25 MiB');
      await writeFile(join(dir, 'second.bin'), 'x');
      await expect(verifyCloudflarePublication({ dist: dir, trustedKeys: {}, fileLimit: 1 })).rejects.toThrow('file limit');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  test('rejects environment files before they can be uploaded', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rock-atlas-pages-env-test-'));
    try {
      await writeFile(join(dir, '.env.production.local'), 'PLACEHOLDER=not-a-secret');
      await expect(verifyCloudflarePublication({ dist: dir, trustedKeys: {} })).rejects.toThrow('Non-public file');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  test('verifies current V3 static objects and rejects a changed active public key', async () => {
    const trustedKeys = JSON.parse(await readFile('src/data/catalog/trusted-catalog-keys.json', 'utf8'));
    const dir = await mkdtemp(join(tmpdir(), 'rock-atlas-pages-bundle-'));
    try {
      await cp('public', dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), '<!doctype html><title>Rock Atlas</title>');
      await writeFile(join(dir, 'catalog-client.json'), JSON.stringify({ channel: 'rock-catalog-v3', schema_version: '3.0',
        trusted_keys_sha256: createHash('sha256').update(canonicalJsonV1(trustedKeys)).digest('hex') }));
      const valid = await verifyCloudflarePublication({ dist: dir, trustedKeys });
      expect(valid.channel).toBe('rock-catalog-v3');
      expect(valid.counts).toMatchObject({ styles: 828, artists: 420, release_groups: 528 });
      const key = Object.values(trustedKeys)[0] as { jwk: { x: string } };
      key.jwk.x = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      await expect(verifyCloudflarePublication({ dist: dir, trustedKeys })).rejects.toThrow(/stale|signature/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
