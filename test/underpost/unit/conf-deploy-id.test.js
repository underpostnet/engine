'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { Config } from '../../../src/server/runtime/conf.js';

// `deployIdFactory` and the proxy builders read and write paths relative to the engine root,
// so every case runs in a fixture tree of its own.
describe('deploy id and proxy configuration', () => {
  const cwd = process.cwd();
  const server = Config.default.server;
  const nodeEnv = process.env.NODE_ENV;
  let root;

  const write = (relative, content) =>
    fs.outputFileSync(
      path.join(root, relative),
      typeof content === 'string' ? content : JSON.stringify(content, null, 4),
    );
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const readJson = (relative) => JSON.parse(read(relative));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-conf-deploy-id-'));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(root);
    Config.default.server = server;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  });

  describe('deployIdFactory', () => {
    it('scaffolds every stage from the example env, with the default configurations', () => {
      write('.env.example', 'NODE_ENV=production\nPORT=3000\nDEPLOY_ID=dd-default\n');
      write('package.json', '{"name":"dd-default"}');

      expect(Config.deployIdFactory('shop')).to.deep.equal({
        deployIdFolder: './engine-private/conf/dd-shop',
        deployId: 'dd-shop',
      });
      const folder = 'engine-private/conf/dd-shop';
      expect(read(`${folder}/.env.production`)).to.equal('NODE_ENV=production\nPORT=3000\nDEPLOY_ID=dd-shop\n');
      expect(read(`${folder}/.env.development`)).to.equal('NODE_ENV=development\nPORT=4000\nDEPLOY_ID=dd-shop\n');
      expect(read(`${folder}/.env.test`)).to.equal('NODE_ENV=test\nPORT=5000\nDEPLOY_ID=dd-shop\n');
      expect(readJson(`${folder}/package.json`)).to.deep.equal({ name: 'dd-shop' });
      for (const confType of Object.keys(Config.default))
        expect(readJson(`${folder}/conf.${confType}.json`), confType).to.deep.equal(
          JSON.parse(JSON.stringify(Config.default[confType])),
        );
    });

    it('takes each stage from its own env file, keeps an existing configuration and copies a sub-configuration', () => {
      write('.env.production', 'NODE_ENV=production\nHOST=dd-default.net\n');
      write('.env.development', 'NODE_ENV=development\nLOCAL=1\n');
      write('.env.test', 'NODE_ENV=test\n');
      write('package.json', '{}');
      write('engine-private/conf/dd-shop/conf.server.json', { kept: true });

      Config.deployIdFactory('dd-shop', { subConf: 'local' });
      const folder = 'engine-private/conf/dd-shop';
      expect(read(`${folder}/.env.production`)).to.equal('NODE_ENV=production\nHOST=dd-shop.net\n');
      expect(read(`${folder}/.env.development`)).to.equal('NODE_ENV=development\nLOCAL=1\n');
      expect(read(`${folder}/.env.test`)).to.equal('NODE_ENV=test\n');
      expect(readJson(`${folder}/conf.server.json`)).to.deep.equal({ kept: true });
      expect(readJson(`${folder}/conf.server.dev.local.json`)).to.deep.equal({ kept: true });
    });

    it('derives every stage from the production env, and writes no env without a template', () => {
      write('.env.production', 'NODE_ENV=production\nPORT=3000\n');
      write('package.json', '{}');
      Config.deployIdFactory('one');
      expect(read('engine-private/conf/dd-one/.env.development')).to.equal('NODE_ENV=development\nPORT=4000\n');
      expect(read('engine-private/conf/dd-one/.env.test')).to.equal('NODE_ENV=test\nPORT=5000\n');

      fs.removeSync('.env.production');
      Config.deployIdFactory('two');
      expect(fs.readdirSync('engine-private/conf/dd-two').filter((file) => file.startsWith('.env'))).to.deep.equal([]);
    });
  });

  describe('buildProxy', () => {
    it('merges the server configuration of every listed deploy and of the replicas named after it', async () => {
      write('engine-private/conf/dd-a/conf.server.json', {
        'a.net': { '/': { client: 'a', replicas: ['/r1', '/r2'] } },
      });
      write('engine-private/conf/dd-b/conf.server.json', { 'b.net': { '/': { client: 'b' } } });
      write('engine-private/replica/dd-a-r1/conf.server.json', { 'r1.a.net': { '/': { client: 'a' } } });
      write('engine-private/replica/other/conf.server.json', { 'other.net': { '/': {} } });

      await Config.buildProxy('dd-a,dd-b');
      expect(Object.keys(Config.default.server)).to.have.members(['a.net', 'b.net', 'r1.a.net']);
      // Every replica path serves a copy of the path that lists it.
      expect(Config.default.server['a.net']['/r1']).to.deep.equal({ client: 'a' });
      expect(Config.default.server['a.net']['/r2']).to.deep.equal({ client: 'a' });
      expect(Config.default.server['a.net']['/'].replicas).to.deep.equal(['/r1', '/r2']);
    });

    it('reads a replica deploy from its replica folder first', async () => {
      write('engine-private/conf/dd-a/conf.server.json', { 'conf.net': { '/': {} } });
      write('engine-private/replica/dd-a/conf.server.json', { 'replica.net': { '/': {} } });
      await Config.build('proxy', 'dd-a');
      expect(Object.keys(Config.default.server)).to.deep.equal(['replica.net']);
    });

    it('orders a single-replica path and reads a development sub-configuration', async () => {
      process.env.NODE_ENV = 'development';
      write('engine-private/conf/dd-a/conf.server.json', { 'a.net': { '/': { client: 'a' } } });
      write('engine-private/conf/dd-a/conf.server.dev.local.json', {
        'a.net': { '/': { client: 'a', singleReplica: true, replicas: ['/z', '/a'] } },
      });
      write('engine-private/conf/dd-a/conf.server.dev.json', {});

      await Config.buildProxy('dd-a', 'local');
      expect(Config.default.server['a.net']['/'].replicas).to.deep.equal(['/a', '/z']);
      // A single replica keeps one path; the development server conf records the order.
      expect(Config.default.server['a.net']).to.have.keys(['/']);
      expect(readJson('engine-private/conf/dd-a/conf.server.dev.json')['a.net']['/'].replicas).to.deep.equal([
        '/a',
        '/z',
      ]);
    });

    it('refuses a deploy without a server configuration', async () => {
      const error = await Config.buildProxy('dd-missing').catch((caught) => caught);
      expect(error?.message).to.match(/configuration file not found/);
    });
  });
});
