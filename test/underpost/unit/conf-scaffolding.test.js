'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  addApiConf,
  addClientConf,
  addWsConf,
  buildApiSrc,
  buildClientSrc,
  buildReplicaId,
  buildWsSrc,
  cloneConf,
  cloneSrcComponents,
  getDataDeploy,
} from '../../../src/server/runtime/conf.js';
import Underpost from '../../../src/index.js';

// The scaffolding commands of `bin/deploy.js` read and write paths relative to the engine root,
// so every case runs in a fixture tree of its own.
describe('deploy scaffolding', () => {
  const cwd = process.cwd();
  let root;

  const write = (relative, content) =>
    fs.outputFileSync(
      path.join(root, relative),
      typeof content === 'string' ? content : JSON.stringify(content, null, 4),
    );
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const readJson = (relative) => JSON.parse(read(relative));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-conf-scaffold-'));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  const sourceConf = () => {
    for (const env of ['production', 'development', 'test'])
      write(`engine-private/conf/dd-default/.env.${env}`, `ENV=${env}\n`);
    write('engine-private/conf/dd-default/conf.server.json', {
      'default.net': { '/': { client: 'default', apis: ['user'] } },
    });
    write('engine-private/conf/dd-default/conf.client.json', {
      default: { components: { default: ['AppShellDefault'] }, services: ['user', 'file'] },
    });
    write('engine-private/conf/dd-default/conf.cron.json', { jobs: {} });
    write('engine-private/conf/dd-default/conf.ssr.json', { Default: { head: ['Seo'] } });
    write('engine-private/conf/dd-default/package.json', { scripts: { start: 'node bin start dd-default' } });
  };

  describe('cloneConf', () => {
    it('copies every environment and configuration of a deploy under the new client name', async () => {
      sourceConf();
      await cloneConf({ toOptions: { deployId: 'dd-shop', clientId: 'shop' }, fromOptions: {} });
      for (const env of ['production', 'development', 'test'])
        expect(read(`engine-private/conf/dd-shop/.env.${env}`)).to.equal(`ENV=${env}\n`);
      expect(readJson('engine-private/conf/dd-shop/conf.client.json')).to.deep.equal({
        shop: { components: { shop: ['AppShellShop'] }, services: ['user', 'file'] },
      });
      expect(readJson('engine-private/conf/dd-shop/conf.server.json')).to.deep.equal({
        'shop.net': { '/': { client: 'shop', apis: ['user'] } },
      });
      expect(readJson('engine-private/conf/dd-shop/conf.ssr.json')).to.deep.equal({ Shop: { head: ['Seo'] } });
      expect(readJson('engine-private/conf/dd-shop/package.json').scripts.start).to.equal('node bin start dd-shop');
    });

    it('overwrites the files of a deploy that already exists', async () => {
      sourceConf();
      write('engine-private/conf/dd-shop/conf.cron.json', { stale: true });
      write('engine-private/conf/dd-shop/extra.json', { kept: true });
      await cloneConf({
        toOptions: { deployId: 'dd-shop', clientId: 'shop' },
        fromOptions: { deployId: 'dd-default', clientId: 'default' },
      });
      expect(readJson('engine-private/conf/dd-shop/conf.cron.json')).to.deep.equal({ jobs: {} });
      expect(readJson('engine-private/conf/dd-shop/extra.json')).to.deep.equal({ kept: true });
    });
  });

  describe('addClientConf', () => {
    it('adds the source client to the target deploy and routes one path to it', async () => {
      sourceConf();
      write('engine-private/conf/dd-shop/conf.client.json', { shop: { services: [] } });
      write('engine-private/conf/dd-shop/conf.server.json', {
        'shop.net': { '/': { client: 'shop', runtime: 'nodejs', apis: [] }, '/admin': { client: 'shop' } },
      });
      write('engine-private/conf/dd-shop/conf.ssr.json', { Shop: { head: [] } });
      await addClientConf({
        toOptions: { deployId: 'dd-shop', clientId: 'shop', host: 'shop.net', path: '/admin' },
        fromOptions: {},
      });
      expect(Object.keys(readJson('engine-private/conf/dd-shop/conf.client.json'))).to.deep.equal(['shop', 'default']);
      expect(readJson('engine-private/conf/dd-shop/conf.server.json')['shop.net']).to.deep.equal({
        '/': { client: 'shop', runtime: 'nodejs', apis: [] },
        '/admin': { client: 'default', runtime: 'nodejs', apis: ['user', 'file'] },
      });
      expect(readJson('engine-private/conf/dd-shop/conf.ssr.json')).to.deep.equal({
        Shop: { head: [] },
        Default: { head: ['Seo'] },
      });
    });
  });

  describe('buildClientSrc', () => {
    it('copies the components, head scripts, entry point and public assets under the new client name', async () => {
      write('src/client/components/default/AppShellDefault.js', "export const AppShellDefault = 'default';\n");
      write('src/client/ssr/head/DefaultScripts.js', '// Default scripts\n');
      write(
        'src/client/Default.index.js',
        "import { AppShellDefault } from './components/default/AppShellDefault.js';\n",
      );
      write('src/client/public/default/favicon.ico', 'icon');
      await buildClientSrc({ toOptions: { deployId: 'dd-shop', clientId: 'shop' }, fromOptions: {} });
      expect(read('src/client/components/shop/AppShellShop.js')).to.equal("export const AppShellShop = 'shop';\n");
      expect(read('src/client/ssr/head/ShopScripts.js')).to.equal('// Shop scripts\n');
      expect(read('src/client/Shop.index.js')).to.equal(
        "import { AppShellShop } from './components/shop/AppShellShop.js';\n",
      );
      expect(read('src/client/public/shop/favicon.ico')).to.equal('icon');
    });
  });

  describe('buildApiSrc', () => {
    const sourceApi = () => {
      for (const type of ['model', 'controller', 'service', 'router'])
        write(`src/api/item/item.${type}.js`, `// Item ${type} of item\n`);
    };

    it('copies the four API modules and the client service under the new API name', async () => {
      sourceApi();
      write('src/client/services/item/item.service.js', 'const ItemService = {};\n');
      await buildApiSrc({ toOptions: { apiId: 'order' }, fromOptions: { apiId: 'item' } });
      for (const type of ['model', 'controller', 'service', 'router'])
        expect(read(`src/api/order/order.${type}.js`)).to.equal(`// Order ${type} of order\n`);
      expect(read('src/client/services/order/order.service.js')).to.equal('const OrderService = {};\n');
    });

    it('creates an empty client service directory when the source API has no client service', async () => {
      sourceApi();
      await buildApiSrc({ toOptions: { apiId: 'order' }, fromOptions: { apiId: 'item' } });
      expect(fs.readdirSync(path.join(root, 'src/client/services/order'))).to.deep.equal([]);
    });
  });

  describe('addApiConf', () => {
    it('serves the new API on every path that serves APIs, and gives the client its service', async () => {
      write('engine-private/conf/dd-shop/conf.server.json', {
        'shop.net': { '/': { apis: ['user'] }, '/static': { client: 'shop' } },
        'admin.shop.net': { '/': { apis: [] } },
      });
      write('engine-private/conf/dd-shop/conf.client.json', { shop: { services: ['user'] } });
      await addApiConf({ toOptions: { apiId: 'order', deployId: 'dd-shop', clientId: 'shop' }, fromOptions: {} });
      expect(readJson('engine-private/conf/dd-shop/conf.server.json')).to.deep.equal({
        'shop.net': { '/': { apis: ['user', 'order'] }, '/static': { client: 'shop' } },
        'admin.shop.net': { '/': { apis: ['order'] } },
      });
      expect(readJson('engine-private/conf/dd-shop/conf.client.json').shop.services).to.deep.equal(['user', 'order']);
    });
  });

  describe('addWsConf', () => {
    it('binds the WebSocket only to the named paths of the named host', async () => {
      write('engine-private/conf/dd-shop/conf.server.json', {
        'shop.net': { '/': {}, '/admin': {}, '/api': {} },
        'other.net': { '/': {} },
      });
      await addWsConf({
        toOptions: { wsId: 'chat', deployId: 'dd-shop', host: 'shop.net', paths: '/,/admin,/missing' },
        fromOptions: {},
      });
      expect(readJson('engine-private/conf/dd-shop/conf.server.json')).to.deep.equal({
        'shop.net': { '/': { ws: 'chat' }, '/admin': { ws: 'chat' }, '/api': {} },
        'other.net': { '/': {} },
      });
    });
  });

  describe('buildWsSrc', () => {
    it('copies the WebSocket tree under the new name and keeps a file the target already has', async () => {
      write('src/ws/default/default.ws.server.js', "export const DefaultWsServer = 'default';\n");
      write('src/ws/default/channels/default.chat.channel.js', '// Default channel\n');
      write('src/ws/chat/chat.ws.server.js', '// edited by hand\n');
      await buildWsSrc({ toOptions: { wsId: 'chat', paths: '/' }, fromOptions: {} });
      expect(read('src/ws/chat/chat.ws.server.js')).to.equal('// edited by hand\n');
      expect(read('src/ws/chat/channels/chat.chat.channel.js')).to.equal('// Chat channel\n');
    });
  });

  describe('cloneSrcComponents', () => {
    it('copies a components directory under the new name', async () => {
      write('src/client/components/default/AppDefault.js', "export const AppDefault = 'default';\n");
      write('src/client/components/default/CssDefault.js', '// Default css\n');
      await cloneSrcComponents({
        toOptions: { componentsFolder: 'shop' },
        fromOptions: { componentsFolder: 'default' },
      });
      expect(fs.readdirSync(path.join(root, 'src/client/components/shop')).sort()).to.deep.equal([
        'AppShop.js',
        'CssShop.js',
      ]);
      expect(read('src/client/components/shop/AppShop.js')).to.equal("export const AppShop = 'shop';\n");
    });
  });

  describe('getDataDeploy', () => {
    const routes = () => {
      write('engine-private/deploy/dd.routes', 'dd-shop, dd-blog,');
      write('engine-private/conf/dd-shop/conf.server.json', {
        'shop.net': { '/': { replicas: ['/b', '/a'], singleReplica: true } },
      });
      write('engine-private/conf/dd-blog/conf.server.json', { 'blog.net': { '/': {} } });
    };

    it('names a replica deploy after its deploy and path', () => {
      expect(buildReplicaId({ deployId: 'dd-shop', replica: '/blog' })).to.equal('dd-shop-blog');
    });

    it('lists every routed deploy, each followed by its single replicas in path order', async () => {
      routes();
      expect(await getDataDeploy({ disableSyncEnvPort: true })).to.deep.equal([
        { deployId: 'dd-shop' },
        { deployId: 'dd-shop-a', replicaHost: 'shop.net' },
        { deployId: 'dd-shop-b', replicaHost: 'shop.net' },
        { deployId: 'dd-blog' },
      ]);
    });

    it('lists no replicas of a deploy that already built them', async () => {
      routes();
      fs.mkdirpSync(path.join(root, 'engine-private/replica/dd-shop'));
      expect(await getDataDeploy({ disableSyncEnvPort: true })).to.deep.equal([
        { deployId: 'dd-shop' },
        { deployId: 'dd-blog' },
      ]);
    });

    it('builds each single replica, then syncs the environment ports', async () => {
      routes();
      fs.mkdirpSync(path.join(root, 'engine-private/replica/stale'));
      const callback = vi.spyOn(Underpost.client, 'callback').mockResolvedValue();
      const deploys = await getDataDeploy({ buildSingleReplica: true });
      expect(deploys.map(({ deployId }) => deployId)).to.deep.equal(['dd-shop', 'dd-shop-a', 'dd-shop-b', 'dd-blog']);
      expect(fs.existsSync(path.join(root, 'engine-private/replica'))).to.equal(false);
      expect(callback.mock.calls).to.deep.equal([
        ['dd-shop', '', 'shop.net', '/', { singleReplica: true }],
        [undefined, '', '', '', { syncEnvPort: true }],
      ]);
    });

    it('lists nothing without a route table', async () => {
      expect(await getDataDeploy({ disableSyncEnvPort: true })).to.deep.equal([]);
    });
  });
});
