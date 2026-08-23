'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { Config, getConfFilePath, loadConf } from '../../src/server/conf.js';

const restoreEnv = (name, value) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

describe('deploy configuration loading', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSubConf = process.env.DEPLOY_SUB_CONF;
  const originalDeployId = process.env.DEPLOY_ID;
  const originalConfig = structuredClone(Config.default);

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('DEPLOY_SUB_CONF', originalSubConf);
    restoreEnv('DEPLOY_ID', originalDeployId);
    for (const key of Object.keys(Config.default)) delete Config.default[key];
    Object.assign(Config.default, structuredClone(originalConfig));
  });

  it('uses a server sub-configuration only in development', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.endsWith('conf.server.dev.nexodev.json'));
    process.env.DEPLOY_SUB_CONF = 'nexodev';

    process.env.NODE_ENV = 'development';
    expect(getConfFilePath('dd-core', 'server')).to.equal('./engine-private/conf/dd-core/conf.server.dev.nexodev.json');

    process.env.NODE_ENV = 'production';
    expect(getConfFilePath('dd-core', 'server')).to.equal('./engine-private/conf/dd-core/conf.server.json');
  });

  it('parses existing deploy files while falling back for missing config types', () => {
    const folder = './engine-private/conf/dd-fixture';
    const files = new Map([
      [`${folder}/conf.server.json`, JSON.stringify({ 'base.test': { '/': { port: 4000 } } })],
      [`${folder}/conf.server.dev.nexodev.json`, JSON.stringify({ 'dev.test': { '/': { port: 4017 } } })],
      [`${folder}/.env.production`, 'DEPLOY_ID=dd-fixture\n'],
      [`${folder}/.env.development`, 'DEPLOY_ID=dd-fixture\n'],
      [`${folder}/.env.test`, 'DEPLOY_ID=dd-fixture\n'],
      [`${folder}/package.json`, JSON.stringify({ name: 'fixture', scripts: { start: 'node src/server dd-fixture' } })],
      ['./package.json', JSON.stringify({ name: 'engine', scripts: { dev: 'node src/server' } })],
    ]);

    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      const path = `${filePath}`;
      return path === folder || files.has(path);
    });
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => files.get(`${filePath}`));
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    process.env.NODE_ENV = 'development';

    loadConf('dd-fixture', 'nexodev');

    expect(Config.default.server).to.deep.equal({ 'dev.test': { '/': { port: 4017 } } });
    expect(Config.default.client).to.deep.equal(originalConfig.client);
  });
});
