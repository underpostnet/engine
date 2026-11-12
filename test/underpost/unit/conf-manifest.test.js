// The conf manifest of a deploy id or a conf workflow, written in a scratch tree from the engine
// `underpost.config.js`: the text around its markers stays, and the imported config never changes.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import underpostConfig from '../../../underpost.config.js';
import { shellHarness } from '../../support/shell-harness.js';

const ENGINE_MANIFEST = fs.readFileSync(new URL('../../../underpost.config.js', import.meta.url), 'utf8');

let cwd;
let scratch;
let harness;

/** The config a manifest file holds, read back as its importers read it. */
const configOf = async (file) => (await import(`${nodePath.resolve(file)}?${Date.now()}`)).default;

beforeEach(() => {
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-conf-manifest-'));
  process.chdir(scratch);
  fs.writeFileSync('underpost.config.js', ENGINE_MANIFEST);
  harness = shellHarness();
});

afterEach(() => {
  harness.restore();
  process.chdir(cwd);
  fs.removeSync(scratch);
});

describe('the conf manifest', () => {
  it('writes the conf files of a deploy id beside the engine manifest, and leaves the imported config as it is', async () => {
    const before = structuredClone(underpostConfig);
    for (const type of ['client', 'server', 'ssr'])
      fs.outputJsonSync(`engine-private/conf/dd-x/conf.${type}.json`, { [type]: `dd-x ${type}` });
    Underpost.repo.writeConfManifest({ deployId: 'dd-x' });
    const written = fs.readFileSync('underpost.config.dd-x.js', 'utf8');
    expect(written.startsWith('const config = /**/')).toBe(true);
    expect(written.trimEnd().endsWith('/**/\n\nexport default config;')).toBe(true);
    expect(await configOf('underpost.config.dd-x.js')).toEqual({
      ...before,
      client: { client: 'dd-x client' },
      server: { server: 'dd-x server' },
      ssr: { ssr: 'dd-x ssr' },
    });
    expect(underpostConfig).toEqual(before);
    expect(fs.readFileSync('underpost.config.js', 'utf8')).toBe(ENGINE_MANIFEST);
  });

  it('writes the engine manifest of a conf workflow', async () => {
    const before = structuredClone(underpostConfig);
    Underpost.repo.writeConfManifest({ confWorkflowId: 'template' });
    const { db, valkey } = (await configOf('underpost.config.js')).server['default.net']['/'];
    expect(valkey).toEqual({ port: 'env:VALKEY_PORT:int:6379', host: 'env:VALKEY_HOST:127.0.0.1' });
    expect(db).toMatchObject({ host: 'env:DB_HOST:mongodb://127.0.0.1:27017', password: 'env:DB_PASSWORD:' });
    expect(underpostConfig).toEqual(before);
  });
});
