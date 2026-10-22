/**
 * The server registry, the universe and the instance graph layout against a real MongoDB replica
 * set: the replica reports, their order and expiry, the logical endpoints discovery offers, the
 * authored universe with its revision guard, and the map cells of an instance.
 *
 * The registry route runs on a real Express server, behind the real server key guard.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import {
  liveEndpoints,
  liveServers,
  reportServer,
  worldAvailable,
  SERVER_LIST_LIMIT,
} from '../../../src/api/cyberia-server-registry/cyberia-server-registry.service.js';
import { CyberiaServerRegistryRouter } from '../../../src/api/cyberia-server-registry/cyberia-server-registry.router.js';
import { CyberiaUniverseService, routeLeads } from '../../../src/api/cyberia-universe/cyberia-universe.service.js';
import { CyberiaInstanceService } from '../../../src/api/cyberia-instance/cyberia-instance.service.js';
import { CyberiaEconomyService } from '../../../src/api/cyberia-economy/cyberia-economy.service.js';
import { CyberiaEconomicItemPolicyService } from '../../../src/api/cyberia-economic-item-policy/cyberia-economic-item-policy.service.js';
import { SERVER_API_KEY_HEADER } from '../../../src/projects/cyberia/runtime/server-key.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const CONTEXT = { host: 'www.cyberia-universe.test', path: '/' };
const APIS = [
  'user',
  'file',
  'cyberia-map',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-economy',
  'cyberia-economic-item-policy',
  'cyberia-item-catalog',
  'cyberia-universe',
  'cyberia-server-registry',
  'cyberia-global-map-code-registry',
];
const SERVER_KEY = 'universe-test-server-key';
const model = (name) => DataBaseProviderService.getModel(name, CONTEXT);

const moderator = { _id: new mongoose.Types.ObjectId(), role: 'moderator' };
const thumbnail = new mongoose.Types.ObjectId();
const stranger = { _id: new mongoose.Types.ObjectId(), role: 'moderator' };
const request = (user, body = {}, params = {}) => ({ auth: { user }, body, params, query: {} });
const universes = {
  create: (body, user = moderator) => CyberiaUniverseService.post(request(user, body), {}, CONTEXT),
  update: (id, body, user = moderator) => CyberiaUniverseService.put(request(user, body, { id }), {}, CONTEXT),
  read: (code) => CyberiaUniverseService.get(request(null, {}, { id: code }), {}, CONTEXT),
  view: (code) => CyberiaUniverseService.view(request(null, {}, { id: code }), {}, CONTEXT),
  ofInstance: (instanceCode) => CyberiaUniverseService.ofInstance(request(null, {}, { instanceCode }), {}, CONTEXT),
};

let seq = 0;
const report = (serverId, instanceCode, state = 'ready', url = `https://server.cyberia.test/${instanceCode}`) =>
  reportServer({ serverId, url, instanceCode, state, seq: ++seq }, CONTEXT);

describe.skipIf(!mongodBinary)('server registry and universes', () => {
  let mongod;

  it('bounds endpoint and operator lists', async () => {
    const now = new Date();
    await model('CyberiaServerRegistry').collection.insertMany(
      Array.from({ length: SERVER_LIST_LIMIT + 1 }, (_, i) => ({
        serverId: `bounded-${i}`,
        instanceCode: 'root',
        url: `https://server.cyberia.test/world-${i}`,
        state: 'ready',
        seq: 1,
        startedAt: now,
        lastSeen: now,
      })),
    );
    expect(await liveEndpoints(CONTEXT)).toHaveLength(SERVER_LIST_LIMIT);
    expect(await liveServers(CONTEXT)).toHaveLength(SERVER_LIST_LIMIT);
  });

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    process.env.CYBERIA_SERVER_API_KEY = SERVER_KEY;
    mongod = await startMongod('cyberia-universe', { replSet: 'testset' });
    await DataBaseProviderService.load({
      apis: APIS,
      ...CONTEXT,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'testset', name: 'cyberia-universe' },
    });
    for (const name of ['CyberiaUniverse', 'CyberiaServerRegistry', 'CyberiaInstance']) await model(name).syncIndexes();
    await model('CyberiaMap').create([
      { code: 'm1', gridX: 32, gridY: 16 },
      { code: 'm2', name: 'East Gate', gridX: 32, gridY: 16 },
    ]);
    await model('CyberiaInstance').create([
      {
        code: 'root',
        name: 'Root World',
        creator: moderator._id,
        cyberiaMapCodes: ['m1', 'm2'],
        thumbnail,
        playerSpawn: { sourceMapCode: 'm2', sourceCellX: 5, sourceCellY: 6 },
      },
      { code: 'test', name: 'Test World', creator: moderator._id },
      { code: 'island', creator: moderator._id },
      { code: 'frontier', creator: moderator._id },
    ]);
    // Every world runs the standard economy but two: test charges a portal fee with the same wallet, so
    // it shares a universe with root; frontier caps its wallet lower, so it shares none.
    await model('CyberiaEconomy').create([
      { code: 'standard' },
      { code: 'tolls', fees: { portal: 5 } },
      { code: 'frontier', currency: { maxBalance: 1000 } },
    ]);
    await model('CyberiaInstanceConf').collection.insertMany([
      { instanceCode: 'test', economyCode: 'tolls' },
      { instanceCode: 'frontier', economyCode: 'frontier' },
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
    delete process.env.CYBERIA_SERVER_API_KEY;
  });

  describe('replica reports', () => {
    beforeEach(async () => await model('CyberiaServerRegistry').deleteMany({}));

    it('groups the replicas of one deployment into one logical endpoint', async () => {
      await report('root-a', 'root', 'ready', 'https://server.cyberia.test');
      await report('root-b', 'root', 'ready', 'https://server.cyberia.test');
      await report('test-a', 'test');
      expect(await liveEndpoints(CONTEXT)).toEqual([
        {
          instanceCode: 'root',
          url: 'https://server.cyberia.test',
          name: '',
          status: 'available',
          ready: 2,
          draining: 0,
          build: '',
          releases: [''],
        },
        {
          instanceCode: 'test',
          url: 'https://server.cyberia.test/test',
          name: '',
          status: 'available',
          ready: 1,
          draining: 0,
          build: '',
          releases: [''],
        },
      ]);
      expect(await liveServers(CONTEXT)).toHaveLength(3);
    });

    it('names the build of an endpoint only while its replicas share it, and the releases they serve', async () => {
      const replica = (serverId, build, releaseId) =>
        reportServer(
          {
            serverId,
            url: 'https://server.cyberia.test',
            instanceCode: 'root',
            state: 'ready',
            seq: ++seq,
            build,
            releaseId,
          },
          CONTEXT,
        );
      await replica('root-a', '0123456789abcdef', 'r1');
      await replica('root-b', '0123456789abcdef', 'r2');
      expect(await liveEndpoints(CONTEXT)).toMatchObject([{ build: '0123456789abcdef', releases: ['r1', 'r2'] }]);
      await replica('root-b', 'fedcba9876543210', 'r1');
      expect(await liveEndpoints(CONTEXT)).toMatchObject([{ build: '', releases: ['r1'] }]);
      await expect(replica('root-c', 'not-hex', 'r1')).rejects.toMatchObject({ status: 400 });
      await expect(replica('root-c', '0123456789abcdef', 'R 1')).rejects.toMatchObject({ status: 400 });
    });

    it('is idempotent, and a late report never undoes a newer state', async () => {
      const ready = {
        serverId: 'root-a',
        url: 'https://server.cyberia.test',
        instanceCode: 'root',
        state: 'ready',
        seq: 5,
      };
      expect(await reportServer(ready, CONTEXT)).toMatchObject({ stale: false, server: { state: 'ready', seq: 5 } });
      expect(await reportServer(ready, CONTEXT)).toMatchObject({ stale: true, server: { seq: 5 } });
      await reportServer({ ...ready, state: 'draining', seq: 7 }, CONTEXT);
      expect(await reportServer({ ...ready, seq: 6 }, CONTEXT)).toMatchObject({
        stale: true,
        server: { state: 'draining' },
      });
      expect(await model('CyberiaServerRegistry').countDocuments({})).toBe(1);
    });

    it('keeps a world available while one replica drains, and offers none when all drain', async () => {
      await report('root-a', 'root', 'ready', 'https://server.cyberia.test');
      await report('root-b', 'root', 'draining', 'https://server.cyberia.test');
      expect(await liveEndpoints(CONTEXT)).toMatchObject([{ status: 'available', ready: 1, draining: 1 }]);
      expect(await worldAvailable('root', CONTEXT)).toBe(true);
      await report('root-a', 'root', 'draining', 'https://server.cyberia.test');
      expect(await liveEndpoints(CONTEXT)).toMatchObject([{ status: 'draining', ready: 0, draining: 2 }]);
      expect(await worldAvailable('root', CONTEXT)).toBe(false);
    });

    it('drops a replica that stops reporting, and keeps the deployment while another one reports', async () => {
      await report('root-a', 'root', 'ready', 'https://server.cyberia.test');
      await report('root-b', 'root', 'ready', 'https://server.cyberia.test');
      await model('CyberiaServerRegistry').updateOne(
        { serverId: 'root-a' },
        { lastSeen: new Date(Date.now() - 120000) },
      );
      expect(await liveEndpoints(CONTEXT)).toMatchObject([{ instanceCode: 'root', status: 'available', ready: 1 }]);
      await model('CyberiaServerRegistry').updateOne(
        { serverId: 'root-b' },
        { lastSeen: new Date(Date.now() - 120000) },
      );
      expect(await liveEndpoints(CONTEXT)).toEqual([]);
      expect(await worldAvailable('root', CONTEXT)).toBe(false);
    });

    it('refuses a malformed report or an internal endpoint', async () => {
      const valid = {
        serverId: 's1',
        url: 'https://server.cyberia.test',
        instanceCode: 'root',
        state: 'ready',
        seq: 1,
      };
      for (const bad of [
        { serverId: '../x' },
        { url: 'https://10.0.0.1' },
        { url: 'https://server.default.svc.cluster.local' },
        { instanceCode: 'a b' },
        { state: 'busy' },
        { seq: 0 },
      ])
        await expect(reportServer({ ...valid, ...bad }, CONTEXT)).rejects.toMatchObject({ status: 400 });
      expect(await model('CyberiaServerRegistry').countDocuments({})).toBe(0);
    });
  });

  describe('the registry route', () => {
    let server;
    let base;

    beforeAll(async () => {
      const app = express();
      app.use(express.json());
      const authMiddleware = (req, res) => res.status(401).json({ status: 'error', message: 'unauthorized' });
      app.use('/api/v1/cyberia-server-registry', CyberiaServerRegistryRouter.router({ ...CONTEXT, authMiddleware }));
      server = await new Promise((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
      });
      base = `http://127.0.0.1:${server.address().port}/api/v1/cyberia-server-registry`;
    });

    afterAll(() => server?.close());

    const post = (body, key) =>
      fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { [SERVER_API_KEY_HEADER]: key } : {}) },
        body: JSON.stringify(body),
      });

    it('takes a report only with the server key, and lists endpoints without process names', async () => {
      await model('CyberiaServerRegistry').deleteMany({});
      const body = {
        serverId: 'pod-1',
        url: 'https://server.cyberia.test',
        instanceCode: 'root',
        state: 'ready',
        seq: 1,
      };
      expect((await post(body)).status).toBe(401);
      expect((await post(body, 'wrong-key')).status).toBe(401);
      const accepted = await post(body, SERVER_KEY);
      expect(accepted.status).toBe(200);
      expect((await accepted.json()).data).toMatchObject({ reportSeconds: 20, ttlSeconds: 60, stale: false });

      const listed = await (await fetch(base)).json();
      expect(listed.data).toEqual([expect.objectContaining({ instanceCode: 'root', ready: 1 })]);
      expect(JSON.stringify(listed)).not.toContain('pod-1');
      expect((await fetch(`${base}/servers`)).status).toBe(401);
    });
  });

  describe('universes', () => {
    let root;

    it('creates a universe of existing instances, each in one universe only', async () => {
      root = await universes.create({
        code: 'cyberia',
        name: 'Cyberia',
        instances: [
          { instanceCode: 'root', x: 0, y: 0 },
          { instanceCode: 'test', x: 2, y: -1 },
        ],
        links: [{ sourceInstanceCode: 'root', targetInstanceCode: 'test', bidirectional: true }],
      });
      expect(root).toMatchObject({ code: 'cyberia', revision: 1, creator: moderator._id });

      await expect(
        universes.create({ code: 'other', instances: [{ instanceCode: 'test', x: 0, y: 0 }] }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        universes.create({ code: 'ghost', instances: [{ instanceCode: 'nowhere', x: 0, y: 0 }] }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        universes.create({
          code: 'bad',
          instances: [
            { instanceCode: 'island', x: 0, y: 0 },
            { instanceCode: 'island', x: 1, y: 0 },
          ],
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        universes.create({
          code: 'mixed',
          instances: [
            { instanceCode: 'island', x: 0, y: 0 },
            { instanceCode: 'frontier', x: 1, y: 0 },
          ],
        }),
      ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('hold different wallets') });
    });

    it('keeps the cells after a reload and refuses a stale save, a code change or a stranger', async () => {
      const moved = await universes.update(root._id, {
        revision: 1,
        instances: [
          { instanceCode: 'root', x: 0, y: 0 },
          { instanceCode: 'test', x: -3, y: 4 },
        ],
      });
      expect(moved.revision).toBe(2);
      expect((await universes.read('cyberia')).instances).toEqual([
        { instanceCode: 'root', x: 0, y: 0 },
        { instanceCode: 'test', x: -3, y: 4 },
      ]);
      expect((await universes.read('cyberia')).links).toEqual([
        { sourceInstanceCode: 'root', targetInstanceCode: 'test', bidirectional: true },
      ]);

      await expect(universes.update(root._id, { revision: 1, name: 'stale' })).rejects.toMatchObject({ status: 409 });
      await expect(universes.update(root._id, { revision: 2, code: 'renamed' })).rejects.toMatchObject({ status: 400 });
      await expect(universes.update(root._id, { revision: 2, name: 'mine' }, stranger)).rejects.toMatchObject({
        status: 403,
      });
      expect((await universes.read('cyberia')).name).toBe('Cyberia');
    });

    it('shows each member with its content and its servers, and keeps an offline one', async () => {
      await model('CyberiaServerRegistry').deleteMany({});
      await report('root-a', 'root', 'ready', 'https://server.cyberia.test');
      const view = await universes.ofInstance('test');
      expect(view).toMatchObject({ code: 'cyberia', name: 'Cyberia', revision: 2 });
      expect(view.instances).toEqual([
        expect.objectContaining({
          instanceCode: 'root',
          name: 'Root World',
          served: true,
          status: 'available',
          url: 'https://server.cyberia.test',
          build: '',
          previewUrl: expect.stringMatching(/\/cyberia-instance\/instance-map\/root\/world-preview$/),
          thumbnailUrl: expect.stringMatching(new RegExp(`/file/blob/${thumbnail}$`)),
          entrySpawn: { mode: 'fixed', mapCode: 'm2', mapName: 'East Gate', cellX: 5, cellY: 6 },
          // Two wide maps side by side, inside their outline: the card is about four times as wide as it is tall.
          w: 1,
          h: expect.closeTo(132 / 516, 6),
        }),
        expect.objectContaining({
          instanceCode: 'test',
          name: 'Test World',
          served: true,
          status: 'offline',
          url: '',
          thumbnailUrl: '',
          entrySpawn: { mode: 'random' },
          w: 1,
          h: 1,
        }),
      ]);
      await expect(universes.ofInstance('island')).rejects.toMatchObject({ status: 404 });
      expect((await universes.view('cyberia')).instances).toHaveLength(2);
    });

    it('leads a route both ways along a bidirectional link, one way along a one-way link', async () => {
      expect(await routeLeads('root', 'test', CONTEXT)).toBe(true);
      expect(await routeLeads('test', 'root', CONTEXT)).toBe(true);
      const { revision } = await universes.read('cyberia');
      await universes.update(root._id, {
        revision,
        links: [{ sourceInstanceCode: 'root', targetInstanceCode: 'test', bidirectional: false }],
      });
      expect(await routeLeads('root', 'test', CONTEXT)).toBe(true);
      expect(await routeLeads('test', 'root', CONTEXT)).toBe(false);
      expect(await routeLeads('root', 'island', CONTEXT)).toBe(false);
      await universes.update(root._id, {
        revision: revision + 1,
        links: [{ sourceInstanceCode: 'root', targetInstanceCode: 'test', bidirectional: true }],
      });
    });

    it('drops a deleted instance from its universe with its links', async () => {
      const doomed = await model('CyberiaInstance').create({ code: 'doomed', creator: moderator._id });
      const current = await universes.read('cyberia');
      await universes.update(current._id, {
        revision: current.revision,
        instances: [...current.instances, { instanceCode: 'doomed', x: 5, y: 5 }],
        links: [...current.links, { sourceInstanceCode: 'doomed', targetInstanceCode: 'root', bidirectional: false }],
      });
      await CyberiaInstanceService.delete(request(moderator, {}, { id: String(doomed._id) }), {}, CONTEXT);
      const after = await universes.read('cyberia');
      expect(after.instances.map((m) => m.instanceCode)).toEqual(['root', 'test']);
      expect(after.links).toHaveLength(1);
      expect(after.revision).toBe(current.revision + 2);
    });
  });

  describe('economy editor', () => {
    const GEL_CID = 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab';
    const economies = {
      view: (code) => CyberiaEconomyService.view(request(null, {}, { id: code }), {}, CONTEXT),
      clone: (code, body) => CyberiaEconomyService.clone(request(moderator, body, { id: code }), {}, CONTEXT),
    };
    const rows = {
      post: (body) => CyberiaEconomicItemPolicyService.post(request(moderator, body), {}, CONTEXT),
      view: (economyCode) =>
        CyberiaEconomicItemPolicyService.view({ ...request(null), query: { economyCode, limit: 10 } }, {}, CONTEXT),
    };

    it('names the worlds that run an economy and the wallet of each of their universes', async () => {
      const view = await economies.view('tolls');
      expect(view).toMatchObject({ worlds: ['test'], itemCount: 0, economy: { code: 'tolls', fees: { portal: 5 } } });
      expect(view.universes).toEqual([{ code: 'cyberia', worlds: ['root', 'test'], defect: '' }]);
      await expect(economies.view('nowhere')).rejects.toMatchObject({ status: 404 });
    });

    it('shows each item row with the definition the catalog binds and the policy it runs', async () => {
      await model('CyberiaItemCatalog').create({ itemId: 'gel', objectLayerCid: GEL_CID });
      await rows.post({ economyCode: 'tolls', itemId: 'gel', market: true, portalFee: 0 });
      const { data, total } = await rows.view('tolls');
      expect(total).toBe(1);
      expect(data[0]).toMatchObject({ itemId: 'gel', objectLayerCid: GEL_CID });
      expect(data[0].effective).toMatchObject({ trade: true, market: true, portalFee: 0, buyback: false });
      await expect(rows.view('nowhere')).rejects.toMatchObject({ status: 404 });
    });

    it('clones a profile with its item rows under a new code', async () => {
      const copy = await economies.clone('tolls', { code: 'tolls-copy', name: 'Tolls copy' });
      expect(copy).toMatchObject({ code: 'tolls-copy', name: 'Tolls copy', revision: 1, fees: { portal: 5 } });
      expect((await economies.view('tolls-copy')).itemCount).toBe(1);
      await expect(economies.clone('tolls', { code: 'tolls-copy' })).rejects.toMatchObject({ status: 409 });
      await expect(economies.clone('tolls', { code: 'bad code' })).rejects.toMatchObject({ status: 400 });
      await expect(economies.clone('nowhere', { code: 'x' })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('instance graph layout', () => {
    const instance = () => model('CyberiaInstance').findOne({ code: 'root' }).lean();
    const save = async (changes) => {
      const stored = await instance();
      return CyberiaInstanceService.put(request(moderator, changes, { id: String(stored._id) }), {}, CONTEXT);
    };

    it('saves map cells under the revision guard, and never moves a portal', async () => {
      const portals = [
        { sourceMapCode: 'm1', sourceCellX: 3, sourceCellY: 4, targetMapCode: 'm2', targetCellX: 7, targetCellY: 8 },
      ];
      await save({ revision: 1, portals });
      const before = await instance();
      await save({ revision: 2, mapLayout: [{ mapCode: 'm2', x: -2, y: 3 }] });
      const after = await instance();
      expect(after.mapLayout).toEqual([{ mapCode: 'm2', x: -2, y: 3 }]);
      expect(after.revision).toBe(3);
      expect(after.portals).toEqual(before.portals);

      await expect(save({ revision: 2, mapLayout: [] })).rejects.toMatchObject({ status: 409 });
      await expect(save({ revision: 3, code: 'other' })).rejects.toMatchObject({ status: 400 });
      await expect(
        save({
          revision: 3,
          mapLayout: [
            { mapCode: 'm1', x: 0, y: 0 },
            { mapCode: 'm2', x: 0, y: 0 },
          ],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('saves a record without a stored revision as revision 1, once', async () => {
      const { insertedId } = await model('CyberiaInstance').collection.insertOne({
        code: 'unrevised',
        creator: moderator._id,
        cyberiaMapCodes: ['m1'],
      });
      const put = (changes) =>
        CyberiaInstanceService.put(request(moderator, changes, { id: String(insertedId) }), {}, CONTEXT);
      const saved = await put({ revision: 1, mapLayout: [{ mapCode: 'm1', x: 2, y: 0 }] });
      expect(saved).toMatchObject({ revision: 2, mapLayout: [{ mapCode: 'm1', x: 2, y: 0 }] });
      await expect(put({ revision: 1, mapLayout: [] })).rejects.toMatchObject({ status: 409 });
    });

    it('drops the cell of a map the instance no longer holds', async () => {
      const stored = await instance();
      await save({ revision: stored.revision, cyberiaMapCodes: ['m1'] });
      expect((await instance()).mapLayout).toEqual([]);
    });
  });
});
