'use strict';

import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { execFileSync } from 'node:child_process';
import { deployEnvFactory } from '../../../src/server/runtime/environment.js';

describe('deploy environment resolution', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('prefers an explicit --env over every other signal', () => {
    process.env.NODE_ENV = 'development';
    expect(deployEnvFactory({ env: 'production', dev: true }, 'test')).to.equal('production');
    expect(deployEnvFactory({ env: '  staging  ' })).to.equal('staging');
  });

  it('treats --dev as the development shorthand', () => {
    expect(deployEnvFactory({ dev: true })).to.equal('development');
    expect(deployEnvFactory({ dev: true }, 'test')).to.equal('development');
  });

  it('falls back to the caller-supplied default, never to ambient NODE_ENV', () => {
    process.env.NODE_ENV = 'development';
    expect(deployEnvFactory({})).to.equal('production');
    expect(deployEnvFactory()).to.equal('production');
    expect(deployEnvFactory({ env: '' }, 'test')).to.equal('test');
  });

  it('lets a caller opt into the ambient environment by passing it as the fallback', () => {
    process.env.NODE_ENV = 'production';
    expect(deployEnvFactory({}, process.env.NODE_ENV || 'development')).to.equal('production');
    delete process.env.NODE_ENV;
    expect(deployEnvFactory({}, process.env.NODE_ENV || 'development')).to.equal('development');
  });
});

describe('CLI env file', () => {
  const environment = new URL('../../../src/server/runtime/environment.js', import.meta.url).href;
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'cli-env-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  /** Loads the env file in a fresh process under an isolated global install; answers what it sees. */
  const load = (shell) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const { loadCliEnv, shellEnvFactory } = await import(${JSON.stringify(environment)});
          loadCliEnv();
          const pick = (env) => Object.fromEntries(['A', 'B', 'C'].filter((key) => key in env).map((key) => [key, env[key]]));
          process.stdout.write(JSON.stringify({ process: pick(process.env), shell: pick(shellEnvFactory()) }));`,
        ],
        { cwd: dir, env: { PATH: process.env.PATH, HOME: dir, npm_config_prefix: dir, ...shell }, encoding: 'utf8' },
      ),
    );

  it('loads ./.env under the shell, and gives back the shell values alone', () => {
    fs.writeFileSync(nodePath.join(dir, '.env'), 'A=file\nB=file\n');
    expect(load({ B: 'shell' })).to.deep.equal({ process: { A: 'file', B: 'shell' }, shell: { B: 'shell' } });
  });

  it('loads the global store over the shell, and gives back the shell values it replaced', () => {
    const store = execFileSync('npm', ['root', '-g'], {
      env: { PATH: process.env.PATH, npm_config_prefix: dir },
      encoding: 'utf8',
    }).trim();
    fs.mkdirSync(nodePath.join(store, 'underpost'), { recursive: true });
    fs.writeFileSync(nodePath.join(store, 'underpost', '.env'), 'B=store\nC=store\n');
    fs.writeFileSync(nodePath.join(dir, '.env'), 'A=file\n');
    expect(load({ B: 'shell' })).to.deep.equal({ process: { B: 'store', C: 'store' }, shell: { B: 'shell' } });
  });
});
