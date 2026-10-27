// Requires mongod (UNDERPOST_MONGOD_BIN): operator changes run in replica-set transactions.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { ApiRouter as PlayerRouter } from '../../../src/api/cyberia-player/cyberia-player.router.js';
import { reportServer } from '../../../src/api/cyberia-server-registry/cyberia-server-registry.service.js';
import {
  authMiddlewareFactory,
  createSessionAndUserToken,
  hashToken,
  jwtSign,
  refreshSessionAndToken,
} from '../../../src/server/security/auth.js';
import { UserDto } from '../../../src/api/user/user.model.js';
import { createGameTicket } from '../../../src/api/cyberia-game-ticket/cyberia-game-ticket.service.js';
import { consumeLaunch } from '../../../src/projects/cyberia/player/player-session.js';
import { playerDetail } from '../../../src/projects/cyberia/player/player-admin.js';
import {
  changeStacks,
  playerStacks,
  restrictAccount,
  runBatch,
} from '../../../src/projects/cyberia/player/player-operations.js';
import { CYBERIA_RUNTIME_APIS } from '../../../src/projects/cyberia/stack/domain-ownership.js';
import { STAT_DEFAULTS } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { playerSessions, stack } from '../../support/player-sessions.js';

vi.mock('../../../src/db/valkey/Valkey.js', async () =>
  (await import('../../support/valkey-memory.js')).memoryValkeyModule(),
);

const CONTEXT = { host: 'www.cyberia.test', path: '/' };
const APIS = ['user', 'file', 'cyberia-instance', 'object-layer', 'cyberia-item-catalog', ...CYBERIA_RUNTIME_APIS];
const model = (name) => DataBaseProviderService.getModel(name, CONTEXT);
const { account, play } = playerSessions(CONTEXT);

/** Item id → type of the definitions the catalog binds. */
const ITEMS = Object.freeze({
  'hero-skin': 'skin',
  'night-skin': 'skin',
  'iron-sword': 'weapon',
  'iron-plate': 'breastplate',
  'ore-chunk': 'resource',
  coin: 'coin',
});
const cids = {};

let operations = 0;
const op = () => `op-${++operations}-${Date.now()}`;
const REASON = 'Support ticket 4211';

/** An offline profile of a new account in universe u1, with its stacks. */
const profile = async ({ bag = [], storage = [], xp = 0, role = 'user' } = {}) => {
  const who = await account({ role });
  const doc = await model('CyberiaPlayer').create({ user: who.user, universeCode: 'u1', bag, storage, xp, epoch: 3 });
  return { who, id: String(doc._id) };
};
const read = (id) => model('CyberiaPlayer').findById(id).lean();
const change = (id, epoch, body, actor = ADMIN) =>
  changeStacks({ playerId: id, operationId: op(), reason: REASON, epoch, change: body, actor }, CONTEXT);
const restrict = (id, body, actor = ADMIN, actorRole = 'admin') =>
  restrictAccount({ playerId: id, operationId: op(), reason: REASON, actor, actorRole, ...body }, CONTEXT);
const bagStack = (itemId, slot, quantity = 1, active = false) => ({
  ...stack(itemId, slot, quantity, cids[itemId]),
  active,
});
const inDays = (days) => new Date(Date.now() + days * 86400000).toISOString();
const add = { type: 'stacks', change: { op: 'add', container: 'bag', itemId: 'ore-chunk', quantity: 4 } };

let ADMIN;
let MODERATOR;

describe.skipIf(!mongodBinary)('operator changes to player profiles and accounts', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    process.env.JWT_SECRET ??= 'player-operations-jwt-secret';
    process.env.ACCESS_EXPIRE_MINUTES ??= '5';
    process.env.REFRESH_EXPIRE_MINUTES ??= '60';
    process.env.DISABLE_API_RATE_LIMIT = '1';
    mongod = await startMongod('cyberia-player-operations', { replSet: 'testset' });
    await DataBaseProviderService.load({
      apis: APIS,
      ...CONTEXT,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'testset', name: 'cyberia-player-operations' },
    });
    for (const name of [
      'CyberiaPlayer',
      'CyberiaPlayerAudit',
      'CyberiaGameSession',
      'CyberiaGameTicket',
      'CyberiaUniverse',
      'CyberiaServerRegistry',
      'User',
    ])
      await model(name).syncIndexes();
    await model('CyberiaInstance').create({ code: 'w1' });
    await model('CyberiaUniverse').create({ code: 'u1', instances: [{ instanceCode: 'w1', x: 0, y: 0 }], links: [] });
    for (const [itemId, type] of Object.entries(ITEMS)) {
      const definition = await model('ObjectLayer').upsertByIdentity(
        {
          profile: { id: 'cyberia', version: 2 },
          data: { item: { id: itemId, type, description: itemId, activable: true }, stats: STAT_DEFAULTS },
        },
        { origin: 'canonical' },
      );
      cids[itemId] = definition.cid;
      await model('CyberiaItemCatalog').bind(itemId, definition.cid, { expectedCid: null, source: 'studio' });
    }
    ADMIN = (await account({ role: 'admin' })).user;
    MODERATOR = (await account({ role: 'moderator' })).user;
  });

  beforeEach(async () => {
    await reportServer(
      { serverId: 'server-a', url: 'http://localhost:8083/w1', instanceCode: 'w1', state: 'ready', seq: Date.now() },
      CONTEXT,
    );
  });

  afterAll(async () => {
    delete process.env.DISABLE_API_RATE_LIMIT;
    await mongoose.disconnect();
    await mongod?.stop();
  });

  describe('the stacks of a profile', () => {
    it('lists each stack with its type and binding, the open slots of the level and the coins', async () => {
      const { id } = await profile({ bag: [bagStack('hero-skin', 0, 1, true), bagStack('ore-chunk', 3, 7)], xp: 900 });
      const stacks = await playerStacks(id, CONTEXT);
      expect(stacks).toMatchObject({ epoch: 3, live: false, level: 4, coins: 0 });
      expect(stacks.bag).toMatchObject({ slots: 9, max: 24 });
      expect(stacks.storage).toMatchObject({ slots: 16, max: 40, stacks: [] });
      expect(stacks.bag.stacks).toEqual([
        {
          itemId: 'hero-skin',
          olCid: cids['hero-skin'],
          quantity: 1,
          slot: 0,
          active: true,
          itemType: 'skin',
          boundCid: cids['hero-skin'],
        },
        {
          itemId: 'ore-chunk',
          olCid: cids['ore-chunk'],
          quantity: 7,
          slot: 3,
          active: false,
          itemType: 'resource',
          boundCid: cids['ore-chunk'],
        },
      ]);
    });

    it('adds, sets the quantity of and removes stacks under the rules of the game, one epoch more each time', async () => {
      const { id } = await profile({ bag: [bagStack('ore-chunk', 0, 2), bagStack('ore-chunk', 1, 5)] });
      const added = await change(id, 3, { op: 'add', container: 'bag', itemId: 'iron-sword', quantity: 1 });
      expect(added).toMatchObject({ outcome: 'done', refusal: '', epoch: 4 });
      expect(added.after).toEqual([
        { itemId: 'iron-sword', olCid: cids['iron-sword'], quantity: 1, slot: 2, active: false },
      ]);
      expect((await read(id)).revision).toBe(1);

      const refusals = [
        [{ op: 'add', container: 'bag', itemId: 'coin', quantity: 5 }, 'coin'],
        [{ op: 'add', container: 'bag', itemId: 'ghost-item', quantity: 1 }, 'unknown_item'],
        [{ op: 'add', container: 'bag', itemId: 'iron-plate', quantity: 1, slot: 0 }, 'slot_taken'],
        [{ op: 'add', container: 'bag', itemId: 'iron-plate', quantity: 1, slot: 8 }, 'locked_slot'],
        [{ op: 'remove', container: 'storage', itemId: 'ore-chunk' }, 'no_stack'],
      ];
      for (const [body, refusal] of refusals)
        expect(await change(id, 4, body), refusal).toMatchObject({ outcome: 'refused', refusal, epoch: 4 });

      expect(
        await change(id, 4, { op: 'quantity', container: 'bag', itemId: 'ore-chunk', slot: 1, quantity: 9 }),
      ).toMatchObject({
        outcome: 'done',
        after: [expect.objectContaining({ slot: 1, quantity: 9 })],
      });
      const removed = await change(id, 5, { op: 'remove', container: 'bag', itemId: 'ore-chunk' });
      expect(removed.outcome).toBe('done');
      expect((await read(id)).bag.map(({ itemId, slot }) => [itemId, slot])).toEqual([['iron-sword', 2]]);
      const records = await model('CyberiaPlayerAudit').find({ player: id }).sort({ createdAt: 1 }).lean();
      expect(records.map(({ action, outcome }) => `${action}:${outcome}`)).toEqual([
        'inventory.add:done',
        ...refusals.map(([body]) => `inventory.${body.op}:refused`),
        'inventory.quantity:done',
        'inventory.remove:done',
      ]);
      expect(records.at(-1)).toMatchObject({
        actor: new mongoose.Types.ObjectId(ADMIN),
        reason: REASON,
        epochBefore: 5,
        epochAfter: 6,
        before: [expect.objectContaining({ slot: 0, quantity: 2 }), expect.objectContaining({ slot: 1, quantity: 9 })],
        after: [],
      });

      const full = await profile({ bag: [...Array(8).keys()].map((slot) => bagStack('ore-chunk', slot)) });
      expect(
        await change(full.id, 3, { op: 'add', container: 'bag', itemId: 'iron-plate', quantity: 1 }),
      ).toMatchObject({
        refusal: 'no_room',
      });
    });

    it('answers a repeated operation id with its outcome, and refuses a stale epoch or a live session', async () => {
      const { id } = await profile();
      const request = {
        playerId: id,
        operationId: op(),
        reason: REASON,
        epoch: 3,
        change: { op: 'add', container: 'storage', itemId: 'ore-chunk', quantity: 3 },
        actor: ADMIN,
      };
      const first = await changeStacks(request, CONTEXT);
      expect(await changeStacks(request, CONTEXT)).toEqual(first);
      expect((await read(id)).storage).toHaveLength(1);
      expect(await changeStacks({ ...request, actor: MODERATOR }, CONTEXT).catch((error) => error)).toMatchObject({
        status: 409,
      });
      expect(await change(id, 3, { op: 'remove', container: 'storage', itemId: 'ore-chunk' })).toMatchObject({
        refusal: 'changed',
      });

      const who = await account();
      const session = await play(who);
      expect(
        await change(session.playerId, session.epoch, {
          op: 'add',
          container: 'bag',
          itemId: 'ore-chunk',
          quantity: 1,
        }),
      ).toMatchObject({
        outcome: 'refused',
        refusal: 'online',
      });
      for (const body of [
        { op: 'quantity', container: 'bag', itemId: 'ore-chunk', quantity: 2 },
        { op: 'add', container: 'vault', itemId: 'ore-chunk', quantity: 1 },
        { op: 'add', container: 'bag', itemId: 'ore-chunk', quantity: 0 },
        { op: 'melt', container: 'bag', itemId: 'ore-chunk' },
      ])
        expect(await change(id, 4, body).catch((error) => error), JSON.stringify(body)).toMatchObject({ status: 400 });
    });

    it('wears and takes off Object Layers under the equipment rules, and never a stored item', async () => {
      const { id } = await profile({
        bag: [
          bagStack('hero-skin', 0, 1, true),
          bagStack('night-skin', 1),
          bagStack('ore-chunk', 2),
          bagStack('iron-sword', 3),
        ],
        storage: [stack('iron-plate', 0, 1, cids['iron-plate'])],
      });
      const worn = await change(id, 3, { op: 'activate', container: 'bag', itemId: 'night-skin' });
      expect(worn).toMatchObject({ outcome: 'done', after: [expect.objectContaining({ itemId: 'night-skin' })] });
      expect((await read(id)).bag.filter(({ active }) => active).map(({ itemId }) => itemId)).toEqual(['night-skin']);
      expect(await change(id, 4, { op: 'activate', container: 'bag', itemId: 'iron-sword' })).toMatchObject({
        outcome: 'done',
      });
      expect(await change(id, 5, { op: 'activate', container: 'bag', itemId: 'ore-chunk' })).toMatchObject({
        refusal: 'not_wearable',
      });
      expect(await change(id, 5, { op: 'deactivate', container: 'bag', itemId: 'night-skin' })).toMatchObject({
        refusal: 'skin_required',
      });
      expect(await change(id, 5, { op: 'activate', container: 'storage', itemId: 'iron-plate' })).toMatchObject({
        refusal: 'stored',
      });
      expect(await change(id, 5, { op: 'deactivate', container: 'bag', itemId: 'iron-sword', slot: 3 })).toMatchObject({
        outcome: 'done',
      });
      expect((await read(id)).bag.filter(({ active }) => active).map(({ itemId }) => itemId)).toEqual(['night-skin']);
    });
  });

  describe('the restriction of an account', () => {
    const fakeRes = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });
    const fakeReq = (cookies = {}) => ({ ip: '127.0.0.1', headers: { 'user-agent': 'test' }, cookies });

    it('locks an account: its portal sessions and game session end, and it opens no session until the lock ends', async () => {
      const who = await account();
      const session = await play(who);
      const { ticket } = await createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT);
      const locked = await restrict(session.playerId, { op: 'lock', until: inDays(3) }, MODERATOR, 'moderator');
      expect(locked).toMatchObject({ outcome: 'done', epoch: session.epoch + 1 });
      const user = await model('User').findById(who.user).lean();
      expect(user.activeSessions).toEqual([]);
      expect(user.restriction).toMatchObject({ kind: 'lock', reason: REASON });
      const lease = await model('CyberiaGameSession').findOne({ user: who.user }).lean();
      expect(String(lease.endedBy)).toBe(MODERATOR);
      expect((await consumeLaunch({ ticket, instanceCode: 'w1', connectionId: 'after-lock' }, CONTEXT)).refusal).toBe(
        'revoked',
      );
      await expect(createSessionAndUserToken(user, model('User'), fakeReq(), fakeRes(), CONTEXT)).rejects.toMatchObject(
        {
          status: 403,
          message: expect.stringMatching(/^This account is locked until /),
        },
      );
      expect(await playerDetail(session.playerId, CONTEXT)).toMatchObject({
        restriction: { kind: 'lock', reason: REASON },
      });

      await model('User').updateOne({ _id: who.user }, { $set: { 'restriction.until': new Date(Date.now() - 1000) } });
      const res = fakeRes();
      expect((await createSessionAndUserToken(user, model('User'), fakeReq(), res, CONTEXT)).jwtid).toBeTruthy();
      expect(res.cookie).toHaveBeenCalled();
      expect((await playerDetail(session.playerId, CONTEXT)).restriction).toBeNull();
    });

    it('refuses the token and the refresh of an account under a restriction', async () => {
      const who = await account();
      const user = await model('User').findById(who.user).lean();
      const token = jwtSign(
        UserDto.auth.payload(user, who.session, '127.0.0.1', 'test', CONTEXT.host, CONTEXT.path),
        CONTEXT,
      );
      await model('User').updateOne(
        { _id: who.user },
        {
          $set: {
            'activeSessions.0.ip': '127.0.0.1',
            'activeSessions.0.userAgent': 'test',
            restriction: { kind: 'ban', reason: REASON, by: ADMIN, at: new Date(), until: null },
          },
        },
      );
      const answer = {};
      const res = {
        status: (code) => Object.assign(answer, { code }) && res,
        json: (body) => Object.assign(answer, body),
      };
      await authMiddlewareFactory(CONTEXT)(
        {
          ip: '127.0.0.1',
          headers: { 'user-agent': 'test', authorization: `Bearer ${token}` },
          params: {},
          method: 'GET',
        },
        res,
        () => Object.assign(answer, { passed: true }),
      );
      expect(answer).toMatchObject({ code: 403, message: 'This account is banned' });
      await model('User').updateOne(
        { _id: who.user },
        { $set: { 'activeSessions.0.tokenHash': hashToken('refresh-cookie') } },
      );
      const res2 = fakeRes();
      await expect(
        refreshSessionAndToken(fakeReq({ refreshToken: 'refresh-cookie' }), res2, model('User'), CONTEXT),
      ).rejects.toMatchObject({ status: 403 });
      expect((await model('User').findById(who.user).lean()).activeSessions).toEqual([]);
    });

    it('lets a moderator lock and lift a lock, an admin ban and lift a ban, and protects admins, moderators and the operator', async () => {
      const { id, who } = await profile();
      await expect(restrict(id, { op: 'ban' }, MODERATOR, 'moderator')).rejects.toMatchObject({ status: 403 });
      expect(await restrict(id, { op: 'ban' })).toMatchObject({ outcome: 'done' });
      expect((await model('User').findById(who.user).lean()).restriction).toMatchObject({ kind: 'ban', until: null });
      expect(await restrict(id, { op: 'lift' }, MODERATOR, 'moderator')).toMatchObject({ refusal: 'forbidden' });
      expect(await restrict(id, { op: 'lift' })).toMatchObject({ outcome: 'done' });
      expect((await model('User').findById(who.user).lean()).restriction).toBeNull();
      expect(await restrict(id, { op: 'lift' })).toMatchObject({ refusal: 'not_restricted' });
      expect(await restrict(id, { op: 'lock', until: inDays(1) }, MODERATOR, 'moderator')).toMatchObject({
        outcome: 'done',
      });
      expect(await restrict(id, { op: 'lift' }, MODERATOR, 'moderator')).toMatchObject({ outcome: 'done' });

      const admin = await profile({ role: 'admin' });
      const moderator = await profile({ role: 'moderator' });
      expect(await restrict(admin.id, { op: 'lock', until: inDays(1) })).toMatchObject({ refusal: 'protected' });
      expect(await restrict(moderator.id, { op: 'lock', until: inDays(1) }, MODERATOR, 'moderator')).toMatchObject({
        refusal: 'protected',
      });
      expect(await restrict(moderator.id, { op: 'lock', until: inDays(1) })).toMatchObject({ outcome: 'done' });
      const self = await model('CyberiaPlayer').create({ user: MODERATOR, universeCode: 'u1' });
      expect(await restrict(String(self._id), { op: 'lock', until: inDays(1) }, MODERATOR, 'moderator')).toMatchObject({
        refusal: 'self',
      });
      for (const body of [
        { op: 'lock' },
        { op: 'lock', until: inDays(91) },
        { op: 'ban', until: inDays(-1) },
        { op: 'mute' },
      ])
        await expect(restrict(id, body), JSON.stringify(body)).rejects.toMatchObject({ status: 400 });
      const trail = await model('CyberiaPlayerAudit').find({ player: id }).sort({ createdAt: 1 }).lean();
      expect(
        trail.map(({ action, outcome, refusal }) => `${action}:${outcome}${refusal ? `:${refusal}` : ''}`),
      ).toEqual([
        'account.ban:done',
        'account.lift:refused:forbidden',
        'account.lift:done',
        'account.lift:refused:not_restricted',
        'account.lock:done',
        'account.lift:done',
      ]);
      expect(trail[0]).toMatchObject({
        account: new mongoose.Types.ObjectId(who.user),
        until: null,
        after: [expect.objectContaining({ kind: 'ban' })],
      });
    });
  });

  describe('a batch', () => {
    const batch = (body, actor = ADMIN, actorRole = 'admin') =>
      runBatch({ reason: REASON, actor, actorRole, preview: false, ...body }, CONTEXT);

    it('previews each profile and writes nothing, then runs each as its own request and retries only what failed', async () => {
      const ready = await profile();
      const stale = await profile();
      const who = await account();
      const live = await play(who);
      const missing = new mongoose.Types.ObjectId();
      const targets = [
        { playerId: ready.id, epoch: 3 },
        { playerId: stale.id, epoch: 2 },
        { playerId: live.playerId, epoch: live.epoch },
        { playerId: String(missing), epoch: 0 },
      ];
      const preview = await batch({ batchId: 'batch-0001', targets, operation: add, preview: true });
      expect(preview.results.map(({ outcome, refusal }) => [outcome, refusal ?? ''])).toEqual([
        ['eligible', ''],
        ['refused', 'changed'],
        ['refused', 'online'],
        ['failed', ''],
      ]);
      expect(preview.results[0].after).toEqual([
        expect.objectContaining({ itemId: 'ore-chunk', quantity: 4, slot: 0 }),
      ]);
      expect((await read(ready.id)).bag).toEqual([]);
      expect(await model('CyberiaPlayerAudit').countDocuments({ batchId: 'batch-0001' })).toBe(0);

      const run = await batch({ batchId: 'batch-0001', targets, operation: add });
      expect(run.results.map(({ outcome }) => outcome)).toEqual(['done', 'refused', 'refused', 'failed']);
      expect(run.results[3].error).toBe('No such profile');
      expect(await model('CyberiaPlayerAudit').countDocuments({ batchId: 'batch-0001' })).toBe(3);

      await model('CyberiaPlayer').create({ _id: missing, user: (await account()).user, universeCode: 'u1' });
      const retry = await batch({ batchId: 'batch-0001', targets: [targets[0], targets[3]], operation: add });
      expect(retry.results.map(({ outcome }) => outcome)).toEqual(['done', 'done']);
      expect((await read(ready.id)).bag).toHaveLength(1);
      expect((await read(String(missing))).bag).toHaveLength(1);
    });

    it('checks the role of the operation and its size', async () => {
      const { id } = await profile();
      const targets = [{ playerId: id, epoch: 3 }];
      await expect(
        batch({ batchId: 'batch-0002', targets, operation: add }, MODERATOR, 'moderator'),
      ).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        batch({ batchId: 'batch-0003', targets, operation: { type: 'account', op: 'ban' } }, MODERATOR, 'moderator'),
      ).rejects.toMatchObject({ status: 403 });
      const locked = await batch(
        { batchId: 'batch-0004', targets, operation: { type: 'account', op: 'lock', until: inDays(2) } },
        MODERATOR,
        'moderator',
      );
      expect(locked.results).toMatchObject([{ outcome: 'done' }]);
      const many = Array.from({ length: 51 }, () => ({ playerId: String(new mongoose.Types.ObjectId()), epoch: 0 }));
      await expect(batch({ batchId: 'batch-0005', targets: many, operation: add })).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        batch({
          batchId: 'batch-0006',
          targets,
          operation: { type: 'stacks', change: { ...add.change, op: 'quantity', slot: 0 } },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('the routes', () => {
    let server;
    let base;
    beforeAll(async () => {
      const app = express();
      app.use(express.json());
      const authMiddleware = (req, res, next) => {
        const role = req.headers['x-role'];
        if (!role) return res.status(401).json({ status: 'error', message: 'unauthorized' });
        req.auth = { user: { _id: role === 'admin' ? ADMIN : MODERATOR, role } };
        next();
      };
      app.use('/player', PlayerRouter({ ...CONTEXT, authMiddleware }));
      await new Promise((done) => (server = app.listen(0, done)));
      base = `http://127.0.0.1:${server.address().port}/player`;
    });
    afterAll(() => server?.close());

    it('refuses every read and change to a role that may not make it, on the server', async () => {
      const { id } = await profile();
      const call = (path, role, method = 'GET', body) =>
        fetch(`${base}${path}`, {
          method,
          headers: { 'content-type': 'application/json', ...(role && { 'x-role': role }) },
          ...(body && { body: JSON.stringify(body) }),
        }).then((res) => res.status);
      const changeBody = { operationId: op(), reason: REASON, epoch: 3, change: add.change };
      expect(await call(`/${id}/stacks`)).toBe(401);
      expect(await call(`/${id}/stacks`, 'user')).toBe(403);
      expect(await call(`/${id}/stacks`, 'moderator')).toBe(200);
      expect(await call(`/${id}/stacks`, 'user', 'POST', changeBody)).toBe(403);
      expect(await call(`/${id}/stacks`, 'moderator', 'POST', changeBody)).toBe(403);
      expect(await call(`/${id}/stacks`, 'admin', 'POST', changeBody)).toBe(200);
      const lock = { operationId: op(), reason: REASON, op: 'lock', until: inDays(1) };
      expect(await call(`/${id}/account`, 'user', 'POST', lock)).toBe(403);
      expect(await call(`/${id}/account`, 'moderator', 'POST', lock)).toBe(200);
      expect(
        await call(`/${id}/account`, 'moderator', 'POST', { ...lock, operationId: op(), op: 'ban', until: null }),
      ).toBe(403);
      expect(await call('/batch', 'user', 'POST', {})).toBe(403);
    });
  });
});
