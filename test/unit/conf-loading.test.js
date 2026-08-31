'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  Config,
  buildApiConf,
  buildClientStaticConf,
  deployEnvContentFactory,
  deployOciEnvFilePath,
  getConfFilePath,
  loadConf,
  ociEnvContentFactory,
} from '../../src/server/runtime/conf.js';

const restoreEnv = (name, value) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

describe('deploy configuration loading', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSubConf = process.env.DEPLOY_SUB_CONF;
  const originalDeployId = process.env.DEPLOY_ID;
  const originalKubernetesHost = process.env.KUBERNETES_SERVICE_HOST;
  const originalRuntimeFixture = process.env.CONF_RUNTIME_FIXTURE;
  const originalConfig = structuredClone(Config.default);

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('DEPLOY_SUB_CONF', originalSubConf);
    restoreEnv('DEPLOY_ID', originalDeployId);
    restoreEnv('KUBERNETES_SERVICE_HOST', originalKubernetesHost);
    restoreEnv('CONF_RUNTIME_FIXTURE', originalRuntimeFixture);
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
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
      [...files.keys()].filter((path) => path.startsWith(`${dir}/`)).map((path) => path.slice(`${dir}/`.length)),
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    process.env.NODE_ENV = 'development';

    loadConf('dd-fixture', 'nexodev');

    expect(Config.default.server).to.deep.equal({ 'dev.test': { '/': { port: 4017 } } });
    expect(Config.default.client).to.deep.equal(originalConfig.client);
  });

  // A container carries only the environment it runs: the other two are a host checkout's
  // convenience, and materializing them writes a second and third copy of that deploy's
  // credentials onto a tree the whole `container_t` domain can read.
  it('materializes only the environments the checkout actually carries', () => {
    const folder = './engine-private/conf/dd-narrow';
    const files = new Map([
      [`${folder}/conf.server.json`, JSON.stringify({ 'narrow.test': { '/': { port: 3000 } } })],
      [`${folder}/.env.production`, 'DEPLOY_ID=dd-narrow\nSECRET=value\n'],
      ['./package.json', JSON.stringify({ name: 'underpost-engine', scripts: { start: 'node bin' } })],
      [`${folder}/package.json`, JSON.stringify({ name: 'narrow', scripts: { start: 'node bin' } })],
    ]);
    const written = new Map();
    vi.spyOn(fs, 'existsSync').mockImplementation((path) => `${path}` === folder || files.has(`${path}`));
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => files.get(`${filePath}`));
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
      [...files.keys()].filter((path) => path.startsWith(`${dir}/`)).map((path) => path.slice(`${dir}/`.length)),
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
    process.env.NODE_ENV = 'production';

    loadConf('dd-narrow');

    expect([...written.keys()].filter((path) => path.startsWith('./.env')).sort()).to.deep.equal([
      './.env',
      './.env.production',
    ]);
  });

  it('keeps the selected production mode while applying the container overlay', () => {
    const folder = './engine-private/conf/dd-runtime';
    const files = new Map([
      [`${folder}/conf.server.json`, JSON.stringify({ 'runtime.test': { '/': { port: 3000 } } })],
      [`${folder}/.env.production`, 'DEPLOY_ID=dd-runtime\nNODE_ENV=development\nCONF_RUNTIME_FIXTURE=host\n'],
      [`${folder}/.env.production.oci`, 'CONF_RUNTIME_FIXTURE=container\n'],
      [`${folder}/.env.development`, 'DEPLOY_ID=dd-runtime\nNODE_ENV=development\n'],
      [`${folder}/.env.test`, 'DEPLOY_ID=dd-runtime\nNODE_ENV=test\n'],
      [`${folder}/package.json`, JSON.stringify({ name: 'runtime', scripts: { start: 'node src/server' } })],
      ['./package.json', JSON.stringify({ name: 'engine', scripts: { prod: 'node src/server' } })],
    ]);

    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}` === folder || files.has(`${filePath}`));
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => files.get(`${filePath}`));
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
      [...files.keys()].filter((path) => path.startsWith(`${dir}/`)).map((path) => path.slice(`${dir}/`.length)),
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, content) => files.set(`${filePath}`, content));
    process.env.NODE_ENV = 'production';
    process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';

    loadConf('dd-runtime');

    expect(process.env.NODE_ENV).to.equal('production');
    expect(process.env.CONF_RUNTIME_FIXTURE).to.equal('container');
    expect(files.get('./.env')).to.include('CONF_RUNTIME_FIXTURE=container');
    expect(files.get('./.env')).to.not.include('CONF_RUNTIME_FIXTURE=host');
  });
});

describe('OCI runtime env overlay', () => {
  const folder = './engine-private/conf/dd-oci';
  const base = ['# deployment base', 'DEPLOY_ID=dd-oci', 'DB_HOST=mongodb://127.0.0.1:27017', 'PORT=3000'].join('\n');
  const overlay = ['DB_HOST=mongodb://mongodb-0.mongodb-service:27017', 'VALKEY_HOST=valkey-service'].join('\n');
  const originalKubernetesHost = process.env.KUBERNETES_SERVICE_HOST;

  const mockFiles = (files) => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => files.has(`${filePath}`));
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => files.get(`${filePath}`));
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
      [...files.keys()].filter((path) => path.startsWith(`${dir}/`)).map((path) => path.slice(`${dir}/`.length)),
    );
  };

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('KUBERNETES_SERVICE_HOST', originalKubernetesHost);
  });

  it('names the overlay per environment, beside the deployment env file', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(deployOciEnvFilePath('dd-oci', 'production')).to.equal(`${folder}/.env.production.oci`);
    expect(deployOciEnvFilePath('dd-oci')).to.equal(`${folder}/.env.production.oci`);
  });

  it('replaces overridden keys in place and keeps everything else verbatim', () => {
    const merged = ociEnvContentFactory(base, overlay);
    expect(merged.split('\n').filter((line) => line.startsWith('DB_HOST='))).to.have.lengthOf(1);
    expect(merged).to.contain('# deployment base');
    expect(merged).to.contain('PORT=3000');
    expect(merged).to.contain('DB_HOST=mongodb://mongodb-0.mongodb-service:27017');
    expect(merged).to.contain('VALKEY_HOST=valkey-service');
    expect(merged).to.not.contain('mongodb://127.0.0.1:27017');
  });

  it('leaves the base untouched when the overlay is empty', () => {
    expect(ociEnvContentFactory(base, '   \n')).to.equal(base);
  });

  it('reads the base file unchanged outside a container', () => {
    delete process.env.KUBERNETES_SERVICE_HOST;
    mockFiles(
      new Map([
        [`${folder}/.env.production`, base],
        [`${folder}/.env.production.oci`, overlay],
      ]),
    );

    const resolved = deployEnvContentFactory('dd-oci', 'production');
    expect(resolved.overlay).to.equal(null);
    expect(resolved.values.DB_HOST).to.equal('mongodb://127.0.0.1:27017');
    expect(resolved.values.VALKEY_HOST).to.equal(undefined);
  });

  it('applies the overlay inside a container', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
    mockFiles(
      new Map([
        [`${folder}/.env.production`, base],
        [`${folder}/.env.production.oci`, overlay],
      ]),
    );

    const resolved = deployEnvContentFactory('dd-oci', 'production');
    expect(resolved.source).to.equal(`${folder}/.env.production`);
    expect(resolved.overlay).to.equal(`${folder}/.env.production.oci`);
    expect(resolved.values.DB_HOST).to.equal('mongodb://mongodb-0.mongodb-service:27017');
    expect(resolved.values.VALKEY_HOST).to.equal('valkey-service');
    expect(resolved.values.PORT).to.equal('3000');
  });

  it('degrades to the base file inside a container with no overlay declared', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
    mockFiles(new Map([[`${folder}/.env.production`, base]]));

    const resolved = deployEnvContentFactory('dd-oci', 'production');
    expect(resolved.overlay).to.equal(null);
    expect(resolved.content).to.equal(base);
  });

  it('honours an explicit oci selector over container detection', () => {
    delete process.env.KUBERNETES_SERVICE_HOST;
    mockFiles(
      new Map([
        [`${folder}/.env.production`, base],
        [`${folder}/.env.production.oci`, overlay],
      ]),
    );

    expect(deployEnvContentFactory('dd-oci', 'production', '', { oci: true }).values.VALKEY_HOST).to.equal(
      'valkey-service',
    );
  });

  it('overlays a sub-configuration source from the plain environment overlay', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
    mockFiles(
      new Map([
        [`${folder}/.env.production`, base],
        [`${folder}/.env.production.api`, `${base}\nPORT=4000`],
        [`${folder}/.env.production.oci`, overlay],
      ]),
    );

    const resolved = deployEnvContentFactory('dd-oci', 'production', 'api');
    expect(resolved.source).to.equal(`${folder}/.env.production.api`);
    expect(resolved.values.PORT).to.equal('4000');
    expect(resolved.values.DB_HOST).to.equal('mongodb://mongodb-0.mongodb-service:27017');
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
