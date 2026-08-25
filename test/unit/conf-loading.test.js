'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  Config,
  buildApiConf,
  buildClientStaticConf,
  getConfFilePath,
  loadConf,
} from '../../src/server/runtime/conf.js';

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

describe('separate client and api development servers', () => {
  const folder = './engine-private/conf/dd-split';
  const originalNodeEnv = process.env.NODE_ENV;
  const base = { deployId: 'dd-split', subConf: 'local', host: 'default.net', path: '/' };
  let written;

  beforeEach(() => {
    written = new Map([
      [`${folder}/conf.server.dev.local.json`, JSON.stringify({ 'default.net': { '/': { client: 'Default' } } })],
      [`${folder}/.env.development`, 'DEPLOY_ID=dd-split\nPORT=4000\n'],
    ]);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => written.has(`${filePath}`));
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => written.get(`${filePath}`));
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, content) => written.set(`${filePath}`, content));
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('NODE_ENV', originalNodeEnv);
  });

  it('derives the api sub-conf and names it back to the caller', async () => {
    expect(await buildApiConf({ ...base, origin: 'http://localhost:4004' })).to.equal('local-dev-api');
    expect(
      JSON.parse(written.get(`${folder}/conf.server.dev.local-dev-api.json`))['default.net']['/'].origins,
    ).to.deep.equal(['http://localhost:4004']);
    expect(written.has(`${folder}/.env.development.local-dev-api`)).to.equal(true);
  });

  it('derives nothing without a client origin, so an ordinary api run keeps its own sub-conf', async () => {
    expect(await buildApiConf({ ...base })).to.equal(undefined);
    expect(written.has(`${folder}/conf.server.dev.local-dev-api.json`)).to.equal(false);
  });

  it('refuses an origin for a host/path the sub-conf does not declare', async () => {
    await expect(buildApiConf({ ...base, host: 'other.net', origin: 'http://localhost:4004' })).rejects.toThrow(
      'No other.net/ instance in conf.server.dev.local.json',
    );
  });

  it('tells the client server which step has not run yet', async () => {
    await expect(buildClientStaticConf({ ...base })).rejects.toThrow('npm run dev:api dd-split local default.net /');
  });

  it('points the client at the api port and itself at the origin the api was given', async () => {
    await buildApiConf({ ...base, origin: 'http://localhost:4004' });
    await buildClientStaticConf({ ...base });

    const instance = JSON.parse(written.get(`${folder}/conf.server.dev.local-dev-client.json`))['default.net']['/'];
    expect(instance.apiBaseHost).to.equal('localhost:4001');
    expect(instance.apiBaseProxyPath).to.equal('/');
    expect(written.get(`${folder}/.env.development.local-dev-client`)).to.include('PORT=4003');
  });
});
