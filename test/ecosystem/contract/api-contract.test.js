import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { API_BASE_PATH, DOMAIN_API_VERSION, apiPathOf } from '../../../src/server/domain/api-contract.js';

const root = new URL('../../..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const files = (dir, pattern) =>
  exists(dir)
    ? fs
        .readdirSync(path.join(root, dir), { recursive: true })
        .filter((file) => pattern.test(file) && !/(^|\/)(node_modules|libs|build|gen)\//.test(file))
        .map((file) => path.join(dir, file))
    : [];

// The first-party APIs: one directory each under src/api.
const APIS = fs
  .readdirSync(path.join(root, 'src/api'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => b.length - a.length);
const UNVERSIONED = new RegExp(`(?<!src)(?<!\\.)/api/(${APIS.join('|')})(?![\\w-])`);

describe('the versioned API contract', () => {
  it('has one version, and one path every host serves it under', () => {
    expect(API_BASE_PATH).toBe(`api/${DOMAIN_API_VERSION}`);
    expect(apiPathOf('/')).toBe(`/api/${DOMAIN_API_VERSION}`);
    expect(apiPathOf('/store')).toBe(`/store/api/${DOMAIN_API_VERSION}`);
  });

  it('mounts every API router once, under the versioned path only', () => {
    const express = read('src/runtime/express/Express.js');
    expect(express).toContain('const apiPath = apiPathOf(path);');
    expect(express.match(/app\.use\(`\$\{apiPath\}\/\$\{api\}`, router\)/g)).toHaveLength(1);
  });

  it('is not configurable: no BASE_API in code, templates or tests', () => {
    const sources = [
      ...files('src', /\.(js|env)$/).filter((file) => !file.startsWith('src/client/public/')),
      ...files('bin', /\.js$/),
      ...files('deploy', /\.sh$/),
      ...files('test', /\.js$/).filter((file) => !file.endsWith('api-contract.test.js')),
      '.env.example',
    ];
    for (const file of sources) expect(read(file), file).not.toMatch(/\bBASE_API\b/);
  });

  it('leaves no first-party caller on an unversioned path', () => {
    const sources = [
      ...files('src', /\.(js|md)$/),
      ...files('bin', /\.js$/),
      ...files('deploy', /\.sh$/),
      ...files('cyberia-server', /\.(go|md)$/),
      ...files('cyberia-client/src', /\.[ch]$/),
      ...['cyberia-client/README.md'].filter(exists),
    ].filter((file) => file !== 'src/cli/monitor.js'); // Grafana's own `/api/user`.
    const offenders = sources.filter((file) => UNVERSIONED.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it.skipIf(!exists('cyberia-server/engineapi/engineapi.go'))('gives the Go server the same path', () => {
    expect(read('cyberia-server/engineapi/engineapi.go')).toContain(`const Base = "/${API_BASE_PATH}"`);
  });

  it.skipIf(!exists('cyberia-client/src/network/data/engine_client.h'))('gives the C client the same path', () => {
    expect(read('cyberia-client/src/network/data/engine_client.h')).toContain(
      `#define ENGINE_API_BASE "/${API_BASE_PATH}"`,
    );
  });
});
