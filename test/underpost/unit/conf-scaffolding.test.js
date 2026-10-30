'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  addApiConf,
  addWsConf,
  buildApiSrc,
  buildReplicaId,
  buildWsSrc,
  getDataDeploy,
} from '../../../src/server/runtime/conf.js';
import Underpost from '../../../src/index.js';

// The generators read and write paths relative to the engine root, so every case runs in a fixture tree of its own.
describe('conf scaffolding', () => {
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
    it('registers the API on every route with a non-empty apis list and no redirect, once', () => {
      const conf = {
        'shop.net': { '/': { apis: ['user'] }, '/static': { client: 'shop' }, '/empty': { apis: [] } },
        'www.shop.net': { '/': { apis: ['user'], redirect: 'https://shop.net' } },
        'admin.shop.net': { '/': { apis: ['user', 'order'] } },
      };
      expect(addApiConf(conf, { apiId: 'order' })).to.deep.equal({
        added: ['shop.net/'],
        present: ['admin.shop.net/'],
      });
      expect(conf['shop.net']).to.deep.equal({
        '/': { apis: ['user', 'order'] },
        '/static': { client: 'shop' },
        '/empty': { apis: [] },
      });
      expect(conf['www.shop.net']['/'].apis).to.deep.equal(['user']);
      expect(addApiConf(conf, { apiId: 'order' }).added).to.deep.equal([]);
    });

    it('limits the registration to one hostname', () => {
      const conf = { 'a.net': { '/': { apis: ['user'] } }, 'b.net': { '/': { apis: ['user'] } } };
      expect(addApiConf(conf, { apiId: 'order', host: 'b.net' }).added).to.deep.equal(['b.net/']);
      expect(conf['a.net']['/'].apis).to.deep.equal(['user']);
    });
  });

  describe('addWsConf', () => {
    it('binds the WebSocket only to the named paths of the named host and reports the server it replaced', () => {
      const conf = { 'shop.net': { '/': { ws: 'core' }, '/admin': {}, '/api': {} }, 'other.net': { '/': {} } };
      expect(addWsConf(conf, { wsId: 'chat', host: 'shop.net', paths: ['/', '/admin'] })).to.deep.equal([
        { route: 'shop.net/', previous: 'core' },
        { route: 'shop.net/admin', previous: undefined },
      ]);
      expect(conf).to.deep.equal({
        'shop.net': { '/': { ws: 'chat' }, '/admin': { ws: 'chat' }, '/api': {} },
        'other.net': { '/': {} },
      });
      expect(addWsConf(conf, { wsId: 'chat', host: 'shop.net', paths: ['/'] })).to.deep.equal([]);
    });

    it('refuses a route that does not exist', () => {
      expect(() => addWsConf({ 'shop.net': {} }, { wsId: 'chat', host: 'shop.net', paths: ['/missing'] })).to.throw(
        'Route not found: shop.net/missing',
      );
    });
  });

  describe('buildWsSrc', () => {
    it('copies the WebSocket tree under the new name and keeps a file the target already has', async () => {
      write('src/ws/default/default.ws.server.js', "export const DefaultWsServer = 'default';\n");
      write('src/ws/default/channels/default.chat.channel.js', '// Default channel\n');
      write('src/ws/chat/chat.ws.server.js', '// edited by hand\n');
      await buildWsSrc({ toOptions: { wsId: 'chat' }, fromOptions: {} });
      expect(read('src/ws/chat/chat.ws.server.js')).to.equal('// edited by hand\n');
      expect(read('src/ws/chat/channels/chat.chat.channel.js')).to.equal('// Chat channel\n');
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
