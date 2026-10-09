import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { createReadStream, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { canonicalJsonV1 } from './src/data/contracts/catalog-v3.ts';

// Vite's default static middleware treats *.json.gz as HTTP Content-Encoding:gzip.
// V3 hashes compressed object bytes before explicit decompression, so serve these as raw files.
function rawCatalogObjects(directory: string) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = (request.url ?? '').split('?')[0]!;
    if (!/^\/data\/rock-catalog-v3\/objects\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.json\.gz$/.test(path)) { next(); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    const file = resolve(directory, `.${path}`);
    void stat(file).then((info) => {
      if (!info.isFile()) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': info.size,
        'Cache-Control': 'public, max-age=31536000, immutable' });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    }).catch(() => { response.writeHead(404); response.end(); });
  };
}

export default defineConfig({
  plugins: [react(), {
    name: 'catalog-v3-raw-gzip',
    configureServer(server) { server.middlewares.use(rawCatalogObjects(server.config.publicDir)); },
    configurePreviewServer(server) { server.middlewares.use(rawCatalogObjects(resolve(server.config.root, server.config.build.outDir))); },
  }, {
    name: 'catalog-v3-client-manifest',
    generateBundle() {
      const keys = readFileSync(new URL('./src/data/catalog/trusted-catalog-keys.json', import.meta.url));
      this.emitFile({ type: 'asset', fileName: 'catalog-client.json', source: JSON.stringify({
        channel: 'rock-catalog-v3', schema_version: '3.0',
        trusted_keys_sha256: createHash('sha256').update(canonicalJsonV1(JSON.parse(keys.toString('utf8')))).digest('hex'),
      }) });
    },
  }],
  server: {
    host: "127.0.0.1",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
