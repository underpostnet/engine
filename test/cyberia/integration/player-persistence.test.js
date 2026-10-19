/**
 * Accounts, guests, launch and resume tickets, gameplay sessions, universe profiles across worlds,
 * player state commits, friendships and status notes against a real MongoDB replica set: the transactions, the
 * unique indexes and the atomic consumption run for real. Guest identities live in a memory stand-in
 * of Valkey. The player service is also called over a real gRPC server, with and without the server key.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import mongoose from 'mongoose';
import express from 'express';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { authMiddlewareFactory, hashToken, jwtSign } from '../../../src/server/security/auth.js';
import { CyberiaSocialRouter } from '../../../src/api/cyberia-social/cyberia-social.router.js';
import { CyberiaSocialProfileRouter } from '../../../src/api/cyberia-social-profile/cyberia-social-profile.router.js';
import { CyberiaPlayerRouter } from '../../../src/api/cyberia-player/cyberia-player.router.js';
import { appearanceReference } from '../../../src/projects/cyberia/player/appearance-preview.js';
import { createGameTicket } from '../../../src/api/cyberia-game-ticket/cyberia-game-ticket.service.js';
import { commitState } from '../../../src/projects/cyberia/player/player-state.js';
import {
  acquireSession,
  checkpointSessions,
  consumeLaunch,
  issueResume,
  issueTravel,
  releaseSession,
} from '../../../src/projects/cyberia/player/player-session.js';
import { GuestService } from '../../../src/api/user/guest.service.js';
import { listFriends, updateFriendship, updateStatusNote } from '../../../src/projects/cyberia/player/social.js';
import { identityPreviews } from '../../../src/projects/cyberia/player/identity.js';
import { DEFAULT_INSTANCE_CODE } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { FRIEND_REQUESTS_MAX } from '../../../src/api/cyberia-social/social-contract.js';
import { heldReport, rebindHeld } from '../../../src/projects/cyberia/player/player-maintenance.js';
import { buildPlayerHandlers, cyberiaProto } from '../../../src/grpc/cyberia/grpc-server.js';
import { reportServer } from '../../../src/api/cyberia-server-registry/cyberia-server-registry.service.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { memoryValkey } from '../../support/valkey-memory.js';

vi.mock('../../../src/db/valkey/Valkey.js', async () =>
  (await import('../../support/valkey-memory.js')).memoryValkeyModule(),
);

const CONTEXT = { host: 'www.cyberia.test', path: '/' };
const APIS = [
  'user',
  'file',
  'cyberia-instance',
  'cyberia-universe',
  'cyberia-server-registry',
  'cyberia-player',
  'cyberia-game-session',
  'cyberia-game-ticket',
  'cyberia-social',
  'cyberia-social-profile',
  'cyberia-quest-progress',
  'object-layer',
  'cyberia-item-catalog',
];
const SERVER_KEY = 'player-test-server-key';
const model = (name) => DataBaseProviderService.getModel(name, CONTEXT);

let usernames = 0;
/** A signed-in account: the user and the `activeSessions` entry of its portal session. */
const account = async (extra = {}) => {
  const n = ++usernames;
  const user = await model('User').create({
    email: `player${n}@cyberia.test`,
    username: `player${n}`,
    role: 'user',
    activeSessions: [
      { tokenHash: `hash-${n}`, expiresAt: new Date(Date.now() + 60000), host: CONTEXT.host, path: '/' },
    ],
    ...extra,
  });
  return { principal: 'account', user: String(user._id), session: String(user.activeSessions[0]._id) };
};

/** A portal guest: its GuestService identity, as a ticket names it. */
const guest = async () => {
  const { user } = await GuestService.create({ ip: '127.0.0.1', headers: { 'user-agent': 'test' } }, CONTEXT);
  return { principal: 'guest', guest: user._id };
};

let connections = 0;
/** A launch from the portal to a game server of a world: the ticket, consumed by a new connection. */
const launch = async (who, instanceCode = 'w1') => {
  const { ticket } = await createGameTicket({ ...who, instanceCode }, CONTEXT);
  const connectionId = `conn-${++connections}`;
  return { ticket, connectionId, consumed: await consumeLaunch({ ticket, instanceCode, connectionId }, CONTEXT) };
};

const play = async (who, instanceCode = 'w1') => {
  const { connectionId } = await launch(who, instanceCode);
  return {
    connectionId,
    ...(await acquireSession({ connectionId, instanceCode, serverId: 'server-a' }, CONTEXT)),
  };
};

let reports = 0;
/** One report of a game server process of a world: it takes sessions until it drains. */
const serve = (instanceCode, state = 'ready', serverId = `server-${instanceCode}`) =>
  reportServer(
    { serverId, url: `http://localhost:8083/${instanceCode}`, instanceCode, state, seq: ++reports },
    CONTEXT,
  );

const stack = (itemId, slot, quantity = 1, olCid = `cid-${itemId}`) => ({
  itemId,
  olCid,
  quantity,
  slot,
  active: false,
});

const emptyState = () => ({
  coins: 0,
  xp: 0,
  bag: [],
  storage: [],
  vaults: [],
  held: [],
  quests: [],
  position: { mapCode: '', x: 0, y: 0, seq: 0 },
});

describe.skipIf(!mongodBinary)('player persistence', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET', 'CYBERIA_GAME_TICKET_TTL_SECONDS'])
      delete process.env[key];
    process.env.CYBERIA_SERVER_API_KEY = SERVER_KEY;
    process.env.JWT_SECRET ??= 'player-test-jwt-secret';
    mongod = await startMongod('cyberia-player', { replSet: 'testset' });
    await DataBaseProviderService.load({
      apis: APIS,
      ...CONTEXT,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'testset', name: 'cyberia-player' },
    });
    for (const name of [
      'CyberiaPlayer',
      'CyberiaGameTicket',
      'CyberiaSocial',
      'CyberiaSocialProfile',
      'CyberiaQuestProgress',
      'CyberiaUniverse',
      'CyberiaServerRegistry',
      'User',
    ])
      await model(name).syncIndexes();
    await model('CyberiaInstance').create([
      { code: 'w1' },
      { code: 'w2' },
      { code: 'w3' },
      { code: DEFAULT_INSTANCE_CODE },
    ]);
    // w3 belongs to no universe.
    await model('CyberiaUniverse').create({
      code: 'u1',
      instances: [
        { instanceCode: 'w1', x: 0, y: 0 },
        { instanceCode: 'w2', x: 1, y: 0 },
        { instanceCode: DEFAULT_INSTANCE_CODE, x: 2, y: 0 },
      ],
      links: [{ sourceInstanceCode: 'w1', targetInstanceCode: 'w2', bidirectional: false }],
    });
  });

  beforeEach(async () => {
    for (const code of ['w1', 'w2', 'w3', DEFAULT_INSTANCE_CODE]) await serve(code);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
    delete process.env.CYBERIA_SERVER_API_KEY;
  });

  describe('launch tickets', () => {
    it('stores only the hash and consumes a ticket once', async () => {
      const who = await account();
      const { ticket } = await createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT);
      expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await model('CyberiaGameTicket').findOne({ user: who.user }).lean();
      expect(stored.tokenHash).toBe(hashToken(ticket));
      expect(JSON.stringify(stored)).not.toContain(ticket);

      const first = await consumeLaunch({ ticket, instanceCode: 'w1', connectionId: 'c-1' }, CONTEXT);
      expect(first).toEqual({
        refusal: '',
        principal: 'account',
        accountId: who.user,
        displayName: expect.any(String),
      });
      expect(await consumeLaunch({ ticket, instanceCode: 'w1', connectionId: 'c-1' }, CONTEXT)).toEqual(first);
      expect(await consumeLaunch({ ticket, instanceCode: 'w1', connectionId: 'c-2' }, CONTEXT)).toEqual({
        refusal: 'replayed',
      });
    });

    it('refuses an unknown, expired, wrong-world or revoked ticket', async () => {
      const who = await account();
      expect(
        (await consumeLaunch({ ticket: 'x'.repeat(43), instanceCode: 'w1', connectionId: 'c' }, CONTEXT)).refusal,
      ).toBe('unknown');

      const { ticket: late } = await createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT);
      await model('CyberiaGameTicket').updateOne(
        { tokenHash: hashToken(late) },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      expect((await consumeLaunch({ ticket: late, instanceCode: 'w1', connectionId: 'c-late' }, CONTEXT)).refusal).toBe(
        'expired',
      );

      const { ticket: elsewhere } = await createGameTicket({ ...who, instanceCode: 'w2' }, CONTEXT);
      expect(
        (await consumeLaunch({ ticket: elsewhere, instanceCode: 'w1', connectionId: 'c-w1' }, CONTEXT)).refusal,
      ).toBe('wrong_instance');
      expect(
        (await consumeLaunch({ ticket: elsewhere, instanceCode: 'w2', connectionId: 'c-w2' }, CONTEXT)).refusal,
      ).toBe('');

      const { ticket } = await createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT);
      await model('User').updateOne({ _id: who.user }, { $set: { activeSessions: [] } });
      expect((await consumeLaunch({ ticket, instanceCode: 'w1', connectionId: 'c-revoked' }, CONTEXT)).refusal).toBe(
        'revoked',
      );
    });

    it('launches a guest that never touches a profile, while its identity lives', async () => {
      const visitor = await guest();
      const profiles = await model('CyberiaPlayer').countDocuments({});
      const { ticket, connectionId, consumed } = await launch(visitor);
      expect(consumed).toEqual({ refusal: '', principal: 'guest' });
      expect(await consumeLaunch({ ticket, instanceCode: 'w1', connectionId }, CONTEXT)).toEqual(consumed);
      expect((await acquireSession({ connectionId, instanceCode: 'w1', serverId: 's' }, CONTEXT)).refusal).toBe(
        'unknown',
      );
      expect(await model('CyberiaPlayer').countDocuments({})).toBe(profiles);

      memoryValkey.clear();
      expect((await launch(visitor)).consumed.refusal).toBe('revoked');
    });

    it('needs a world with a server that takes sessions, and a universe for an account', async () => {
      const who = await account();
      await serve('w2', 'draining');
      await expect(createGameTicket({ ...who, instanceCode: 'w2' }, CONTEXT)).rejects.toMatchObject({ status: 503 });
      await serve('w2', 'ready', 'server-w2-replica');
      expect((await createGameTicket({ ...who, instanceCode: 'w2' }, CONTEXT)).ticket).toBeTruthy();

      await expect(createGameTicket({ ...who, instanceCode: 'w3' }, CONTEXT)).rejects.toMatchObject({ status: 409 });
      expect((await createGameTicket({ ...(await guest()), instanceCode: 'w3' }, CONTEXT)).ticket).toBeTruthy();
    });

    it('needs a known world and bounds the open tickets of an account', async () => {
      const who = await account();
      await expect(createGameTicket({ ...who, instanceCode: 'nowhere' }, CONTEXT)).rejects.toMatchObject({
        status: 404,
      });
      for (let i = 0; i < 5; i++) await createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT);
      await expect(createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT)).rejects.toMatchObject({ status: 429 });
    });

    it('launches the default world when the request names none', async () => {
      const visitor = await guest();
      const { ticket, path } = await createGameTicket(visitor, CONTEXT);
      expect(path).toBe('');
      const consumed = await consumeLaunch(
        { ticket, instanceCode: DEFAULT_INSTANCE_CODE, connectionId: 'c-default' },
        CONTEXT,
      );
      expect(consumed).toEqual({ refusal: '', principal: 'guest' });
    });
  });

  describe('gameplay sessions', () => {
    it('creates the profile once, keeps the epoch for a retry and raises it for a new launch', async () => {
      const who = await account();
      const first = await play(who);
      expect(first).toMatchObject({ refusal: '', epoch: 1, created: true, leaseSeconds: 60 });
      expect(first.state).toMatchObject({ coins: 0, xp: 0, bag: [], quests: [] });

      const retry = await acquireSession(
        { connectionId: first.connectionId, instanceCode: 'w1', serverId: 'server-a' },
        CONTEXT,
      );
      expect(retry.epoch).toBe(1);

      const second = await play(who);
      expect(second.playerId).toBe(first.playerId);
      expect(second.epoch).toBe(2);
      const lease = await model('CyberiaGameSession').findOne({ user: who.user }).lean();
      expect(lease).toMatchObject({ connection: second.connectionId, epoch: 2, instanceCode: 'w1' });
      expect(await model('CyberiaPlayer').countDocuments({ user: who.user })).toBe(1);
    });

    it('refuses a connection that consumed no ticket of the world', async () => {
      expect(
        (await acquireSession({ connectionId: 'never', instanceCode: 'w1', serverId: 's' }, CONTEXT)).refusal,
      ).toBe('unknown');
    });

    it('resumes a session once its lease ends, and never past a newer launch', async () => {
      const who = await account();
      const live = await play(who);
      const lease = { playerId: live.playerId, accountId: who.user, epoch: live.epoch, instanceCode: 'w1' };
      const { ticket, refusal } = await issueResume(lease, CONTEXT);
      expect(refusal).toBe('');
      const resume = (connectionId) => consumeLaunch({ ticket, instanceCode: 'w1', connectionId }, CONTEXT);

      expect((await resume('resume-1')).refusal).toBe('busy');
      await releaseSession({ playerId: live.playerId, accountId: who.user, epoch: live.epoch }, CONTEXT);
      expect(await resume('resume-1')).toMatchObject({ refusal: '', principal: 'account', accountId: who.user });
      const resumed = await acquireSession({ connectionId: 'resume-1', instanceCode: 'w1', serverId: 's' }, CONTEXT);
      expect(resumed).toMatchObject({ refusal: '', playerId: live.playerId, epoch: live.epoch + 1 });
      expect((await resume('resume-2')).refusal).toBe('replayed');

      expect((await issueResume(lease, CONTEXT)).refusal).toBe('signed_in_elsewhere');
      const next = await issueResume({ ...lease, epoch: resumed.epoch }, CONTEXT);
      await play(who);
      await model('CyberiaGameSession').updateOne({ user: who.user }, { expiresAt: new Date(Date.now() - 1000) });
      expect(
        (await consumeLaunch({ ticket: next.ticket, instanceCode: 'w1', connectionId: 'resume-3' }, CONTEXT)).refusal,
      ).toBe('signed_in_elsewhere');
    });

    it('keeps one resume ticket per session, outside the cap of portal tickets', async () => {
      const who = await account();
      const live = await play(who);
      const lease = { playerId: live.playerId, accountId: who.user, epoch: live.epoch, instanceCode: 'w1' };
      for (let i = 0; i < 6; i++) expect((await issueResume(lease, CONTEXT)).refusal).toBe('');
      expect(await model('CyberiaGameTicket').countDocuments({ user: who.user, epoch: live.epoch })).toBe(1);
      for (let i = 0; i < 5; i++) await createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT);
    });

    it('issues the ticket of a travel along a route, which the target world takes once the source released', async () => {
      const who = await account();
      const live = await play(who);
      const lease = { playerId: live.playerId, accountId: who.user, epoch: live.epoch, instanceCode: 'w1' };
      const travel = await issueTravel({ ...lease, targetCode: 'w2' }, CONTEXT);
      expect(travel).toMatchObject({ refusal: '', ticket: expect.any(String) });
      const consume = (instanceCode, connectionId) =>
        consumeLaunch({ ticket: travel.ticket, instanceCode, connectionId }, CONTEXT);

      expect((await consume('w1', 'travel-0')).refusal).toBe('wrong_instance');
      await releaseSession({ playerId: live.playerId, accountId: who.user, epoch: live.epoch }, CONTEXT);
      expect(await consume('w2', 'travel-1')).toMatchObject({ refusal: '', principal: 'account', accountId: who.user });
      const arrived = await acquireSession({ connectionId: 'travel-1', instanceCode: 'w2', serverId: 's' }, CONTEXT);
      expect(arrived).toMatchObject({ refusal: '', playerId: live.playerId, epoch: live.epoch + 1 });
      expect((await consume('w2', 'travel-2')).refusal).toBe('replayed');

      const there = { ...lease, epoch: arrived.epoch, instanceCode: 'w2' };
      expect((await issueTravel({ ...there, targetCode: 'w1' }, CONTEXT)).refusal).toBe('no_route');
      expect((await issueTravel({ ...there, targetCode: 'w3' }, CONTEXT)).refusal).toBe('no_route');
      expect((await issueTravel({ ...lease, targetCode: 'w2' }, CONTEXT)).refusal).toBe('signed_in_elsewhere');
    });

    it('refuses a travel to a world no server takes now', async () => {
      const who = await account();
      const live = await play(who);
      await model('CyberiaServerRegistry').deleteMany({ instanceCode: 'w2' });
      const lease = { playerId: live.playerId, accountId: who.user, epoch: live.epoch, instanceCode: 'w1' };
      expect((await issueTravel({ ...lease, targetCode: 'w2' }, CONTEXT)).refusal).toBe('unavailable');
    });

    it('refuses the resume of a session whose portal session ended', async () => {
      const who = await account();
      const live = await play(who);
      await model('User').updateOne({ _id: who.user }, { $set: { activeSessions: [] } });
      const lease = { playerId: live.playerId, accountId: who.user, epoch: live.epoch, instanceCode: 'w1' };
      expect((await issueResume(lease, CONTEXT)).refusal).toBe('revoked');
    });
  });

  describe('state commits', () => {
    let who;
    let session;

    beforeEach(async () => {
      who = await account();
      session = await play(who);
    });

    const commit = (seq, state, extra = {}) =>
      commitState(
        {
          playerId: session.playerId,
          epoch: session.epoch,
          seq,
          state,
          questsChanged: false,
          positionChanged: false,
          ...extra,
        },
        CONTEXT,
      );

    it('applies a whole state with its quests in one transaction, once per sequence', async () => {
      const state = {
        ...emptyState(),
        coins: 12,
        xp: 300,
        bag: [stack('sword', 2)],
        storage: [stack('gem', 0, 9)],
        vaults: [{ actionCode: 'bank', stacks: [stack('gem', 1, 2)] }],
        held: [{ stack: stack('relic', 0, 1, 'cid-old'), container: 'bag', actionCode: '', reason: 'rebound' }],
        quests: [
          {
            questCode: 'q1',
            status: 'active',
            steps: [{ stepId: 's1', objectives: [{ current: 1, required: 3 }] }],
            startedAtMs: 1000,
            completedAtMs: 0,
          },
          { questCode: 'q2', status: 'completed', steps: [], startedAtMs: 1000, completedAtMs: 2000 },
        ],
      };
      expect(await commit(1, state, { questsChanged: true })).toEqual({ refusal: '', duplicate: false, revision: 1 });
      expect(await commit(1, { ...state, coins: 99 })).toEqual({ refusal: '', duplicate: true, revision: 1 });

      const loaded = await acquireSession(
        { connectionId: session.connectionId, instanceCode: 'w1', serverId: 's' },
        CONTEXT,
      );
      expect(loaded.state).toMatchObject({
        coins: 12,
        xp: 300,
        bag: [{ itemId: 'sword', olCid: 'cid-sword', slot: 2 }],
      });
      expect(loaded.state.held[0]).toMatchObject({ reason: 'rebound', stack: { olCid: 'cid-old' } });
      expect(loaded.state.quests.map((q) => [q.questCode, q.status])).toEqual([
        ['q1', 'active'],
        ['q2', 'completed'],
      ]);

      expect(await commit(2, { ...state, quests: [state.quests[1]] }, { questsChanged: true })).toMatchObject({
        refusal: '',
      });
      expect(await model('CyberiaQuestProgress').find({ player: session.playerId }).distinct('questCode')).toEqual([
        'q2',
      ]);
      expect(await commit(3, { ...state, coins: 1 })).toMatchObject({ refusal: '' });
      expect(await model('CyberiaQuestProgress').countDocuments({ player: session.playerId })).toBe(1);
    });

    it('refuses an older epoch and a malformed state', async () => {
      const next = await play(who);
      expect(await commit(1, emptyState())).toEqual({ refusal: 'stale_session', duplicate: false, revision: 0 });
      const bad = [
        { ...emptyState(), bag: [stack('a', 0), stack('b', 0)] },
        { ...emptyState(), bag: [stack('a', 24)] },
        { ...emptyState(), coins: -1 },
        { ...emptyState(), held: [{ stack: stack('a', 0), container: 'pocket', reason: 'rebound' }] },
      ];
      for (const state of bad)
        expect(
          (
            await commitState(
              {
                playerId: next.playerId,
                epoch: next.epoch,
                seq: 1,
                state,
                questsChanged: false,
                positionChanged: false,
              },
              CONTEXT,
            )
          ).refusal,
        ).toBe('invalid');
      expect((await model('CyberiaPlayer').findById(next.playerId).lean()).revision).toBe(0);
    });

    it('orders positions by their sequence, and a checkpoint never touches the goods', async () => {
      await commit(1, { ...emptyState(), coins: 50 });
      const lease = { playerId: session.playerId, accountId: who.user, epoch: session.epoch };
      await checkpointSessions(
        { sessions: [{ ...lease, mapCode: 'm1', position: { mapCode: 'm1', x: 5, y: 6, seq: 5 } }] },
        CONTEXT,
      );
      await commit(
        2,
        { ...emptyState(), coins: 50, position: { mapCode: 'm0', x: 1, y: 1, seq: 4 } },
        { positionChanged: true },
      );
      const player = await model('CyberiaPlayer').findById(session.playerId).lean();
      expect(player.worlds).toEqual([
        expect.objectContaining({
          instanceCode: 'w1',
          positionSeq: 5,
          position: expect.objectContaining({ mapCode: 'm1', x: 5, y: 6 }),
        }),
      ]);
      expect(player.coins).toBe(50);
    });
  });

  describe('universe profiles', () => {
    const fullState = (overrides = {}) => ({
      ...emptyState(),
      coins: 40,
      xp: 900,
      bag: [stack('sword', 0)],
      storage: [stack('gem', 0, 3)],
      vaults: [{ actionCode: 'bank', stacks: [stack('ore', 0, 5)] }],
      held: [
        { stack: stack('relic', 0, 1, 'cid-old'), container: 'bag', actionCode: '', reason: 'rebound' },
        { stack: stack('coin-bag', 0, 1, 'cid-x'), container: 'vault', actionCode: 'bank', reason: 'no_room' },
      ],
      quests: [{ questCode: 'q1', status: 'active', steps: [], startedAtMs: 1000, completedAtMs: 0 }],
      position: { mapCode: 'w1-map', x: 3, y: 4, seq: 1 },
      ...overrides,
    });
    const commitIn = (session, seq, state) =>
      commitState(
        {
          playerId: session.playerId,
          epoch: session.epoch,
          seq,
          state,
          questsChanged: true,
          positionChanged: true,
        },
        CONTEXT,
      );

    it('resolves one profile in every world of the universe, created once', async () => {
      const who = await account();
      const inW1 = await play(who, 'w1');
      expect(inW1).toMatchObject({ refusal: '', created: true });
      await commitIn(inW1, 1, fullState());
      const inW2 = await play(who, 'w2');
      expect(inW2).toMatchObject({ refusal: '', playerId: inW1.playerId, epoch: inW1.epoch + 1, created: false });
      expect(await model('CyberiaPlayer').countDocuments({ user: who.user })).toBe(1);
      expect((await model('CyberiaPlayer').findById(inW1.playerId).lean()).universeCode).toBe('u1');
    });

    it('carries the profile across worlds and keeps the position, vaults and quests of each world', async () => {
      const who = await account();
      const inW1 = await play(who, 'w1');
      await commitIn(inW1, 1, fullState());

      const inW2 = await play(who, 'w2');
      expect(inW2.state).toMatchObject({
        coins: 40,
        xp: 900,
        bag: [expect.objectContaining({ itemId: 'sword' })],
        storage: [expect.objectContaining({ itemId: 'gem' })],
        vaults: [],
        quests: [],
        position: { mapCode: '', x: 0, y: 0 },
      });
      expect(inW2.state.held).toEqual([expect.objectContaining({ container: 'bag', reason: 'rebound' })]);

      await commitIn(
        inW2,
        1,
        fullState({
          coins: 25,
          vaults: [],
          held: inW2.state.held,
          quests: [{ questCode: 'q-w2', status: 'completed', steps: [], startedAtMs: 1, completedAtMs: 2 }],
          position: { mapCode: 'w2-map', x: 9, y: 9, seq: 1 },
        }),
      );

      const back = await play(who, 'w1');
      expect(back.state).toMatchObject({
        coins: 25,
        vaults: [{ actionCode: 'bank', stacks: [expect.objectContaining({ itemId: 'ore' })] }],
        position: { mapCode: 'w1-map', x: 3, y: 4 },
      });
      expect(back.state.quests.map((q) => q.questCode)).toEqual(['q1']);
      expect(back.state.held.map((h) => h.container).sort()).toEqual(['bag', 'vault']);
      const quests = await model('CyberiaQuestProgress').find({ player: inW1.playerId }).lean();
      expect(quests.map(({ instanceCode, questCode }) => `${instanceCode}:${questCode}`).sort()).toEqual([
        'w1:q1',
        'w2:q-w2',
      ]);
    });

    it('refuses a late write of the world a player left, so nothing doubles', async () => {
      const who = await account();
      const inW1 = await play(who, 'w1');
      await commitIn(inW1, 1, fullState({ coins: 10 }));
      const inW2 = await play(who, 'w2');
      expect(await commitIn(inW1, 2, fullState({ coins: 999 }))).toMatchObject({ refusal: 'stale_session' });
      await checkpointSessions(
        {
          sessions: [
            {
              playerId: inW1.playerId,
              accountId: who.user,
              epoch: inW1.epoch,
              mapCode: 'w1-map',
              position: { mapCode: 'w1-map', x: 50, y: 50, seq: 9 },
            },
          ],
        },
        CONTEXT,
      );
      const profile = await model('CyberiaPlayer').findById(inW2.playerId).lean();
      expect(profile.coins).toBe(10);
      expect(profile.worlds.find((w) => w.instanceCode === 'w1').position).toMatchObject({ x: 3, y: 4 });
      expect(await model('CyberiaGameSession').countDocuments({ user: who.user })).toBe(1);
    });

    it('refuses an account in a world outside every universe, and keeps no profile for it', async () => {
      const who = await account();
      await model('CyberiaGameTicket').create({
        tokenHash: 'w3-hash',
        principal: 'account',
        user: who.user,
        session: who.session,
        instanceCode: 'w3',
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: new Date(),
        connection: 'w3-connection',
      });
      expect(
        (await acquireSession({ connectionId: 'w3-connection', instanceCode: 'w3', serverId: 's' }, CONTEXT)).refusal,
      ).toBe('unavailable');
      expect(await model('CyberiaPlayer').countDocuments({ user: who.user })).toBe(0);
    });
  });

  describe('leases', () => {
    it('renews a live lease and ends a session another launch took or the portal revoked', async () => {
      const who = await account();
      const first = await play(who);
      const lease = { playerId: first.playerId, accountId: who.user, epoch: first.epoch, mapCode: 'm2' };
      const before = (await model('CyberiaGameSession').findOne({ user: who.user }).lean()).expiresAt;
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await checkpointSessions({ sessions: [lease] }, CONTEXT)).toEqual({ ended: [] });
      const renewed = await model('CyberiaGameSession').findOne({ user: who.user }).lean();
      expect(renewed.mapCode).toBe('m2');
      expect(renewed.expiresAt.getTime()).toBeGreaterThan(before.getTime());

      await play(who);
      expect(await checkpointSessions({ sessions: [lease] }, CONTEXT)).toEqual({
        ended: [{ playerId: first.playerId, reason: 'signed_in_elsewhere' }],
      });

      const other = await account();
      const live = await play(other);
      await model('User').updateOne({ _id: other.user }, { $set: { activeSessions: [] } });
      expect(
        await checkpointSessions(
          { sessions: [{ playerId: live.playerId, accountId: other.user, epoch: live.epoch }] },
          CONTEXT,
        ),
      ).toEqual({ ended: [{ playerId: live.playerId, reason: 'revoked' }] });
    });

    it('releases only the lease of the epoch that ends', async () => {
      const who = await account();
      const first = await play(who);
      const second = await play(who);
      await releaseSession({ playerId: first.playerId, accountId: who.user, epoch: first.epoch }, CONTEXT);
      expect(await model('CyberiaGameSession').countDocuments({ user: who.user })).toBe(1);
      await releaseSession({ playerId: second.playerId, accountId: who.user, epoch: second.epoch }, CONTEXT);
      expect(await model('CyberiaGameSession').countDocuments({ user: who.user })).toBe(0);
    });
  });

  describe('friendships', () => {
    it('bounds incoming requests without hiding outgoing requests', async () => {
      const owner = await account();
      for (let i = 0; i <= FRIEND_REQUESTS_MAX; i++) {
        const sender = await account();
        await updateFriendship({ accountId: sender.user, action: 'request', targetAccountId: owner.user }, CONTEXT);
      }
      const target = await account();
      await updateFriendship({ accountId: owner.user, action: 'request', targetAccountId: target.user }, CONTEXT);
      const { friends } = await listFriends({ accountId: owner.user }, CONTEXT);
      expect(friends.filter(({ status }) => status === 'incoming')).toHaveLength(FRIEND_REQUESTS_MAX);
      expect(friends.filter(({ status }) => status === 'outgoing')).toHaveLength(1);
    });
    it('guards both social REST readers and offers no client write route', async () => {
      const owner = await account();
      await updateStatusNote({ accountId: owner.user, note: 'Private note' }, CONTEXT);
      const profile = await model('CyberiaSocialProfile').findOne({ user: owner.user }).lean();
      const app = express();
      const options = { ...CONTEXT, authMiddleware: authMiddlewareFactory(CONTEXT) };
      app.use('/social', CyberiaSocialRouter.router(options));
      app.use('/profile', CyberiaSocialProfileRouter.router(options));
      const http = await new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
      });
      try {
        const base = `http://127.0.0.1:${http.address().port}`;
        for (const path of ['/social', `/social/${profile._id}`, '/profile', `/profile/${profile._id}`]) {
          expect((await fetch(base + path)).status).toBe(401);
          for (const role of ['user', 'guest']) {
            const token = jwtSign({ _id: owner.user, role }, CONTEXT, 5, 10);
            const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
            expect(response.status).toBe(403);
            expect(await response.text()).not.toContain('Private note');
          }
        }
        expect((await fetch(base + '/profile', { method: 'POST' })).status).toBe(404);
        expect((await fetch(base + `/profile/${profile._id}`, { method: 'PUT' })).status).toBe(404);
      } finally {
        await new Promise((resolve) => http.close(resolve));
      }
    });
    it('accepts one concurrent note update across independent database connections', async () => {
      const who = await account();
      const connection = await mongoose.createConnection(mongod.uri).asPromise();
      const { CyberiaSocialProfileSchema } =
        await import('../../../src/api/cyberia-social-profile/cyberia-social-profile.model.js');
      const replicaProfile = connection.model('CyberiaSocialProfile', CyberiaSocialProfileSchema);
      const getModel = DataBaseProviderService.getModel.bind(DataBaseProviderService);
      const lookup = vi
        .spyOn(DataBaseProviderService, 'getModel')
        .mockImplementation((name, context) =>
          name === 'CyberiaSocialProfile' && context.replica ? replicaProfile : getModel(name, context),
        );
      try {
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            updateStatusNote({ accountId: who.user, note: `🌲${i}` }, { ...CONTEXT, replica: i % 2 }),
          ),
        );
        expect(results.filter(({ refusal }) => !refusal)).toHaveLength(1);
        expect(results.filter(({ refusal }) => refusal === 'too_soon')).toHaveLength(11);
        expect(results.filter(({ refusal }) => refusal === 'too_soon')).toEqual(
          expect.arrayContaining([expect.objectContaining({ nextUpdateAtMs: expect.any(Number) })]),
        );
        expect(await replicaProfile.countDocuments({ user: who.user })).toBe(1);
      } finally {
        lookup.mockRestore();
        await connection.close();
      }
    });

    it('projects notes for owners and accepted friends, with presence from a live lease only', async () => {
      const owner = await account();
      const friend = await account();
      const stranger = await account();
      await updateStatusNote({ accountId: owner.user, note: 'e\u0301 🌲 👩‍👧' }, CONTEXT);
      const pending = await updateFriendship(
        { accountId: friend.user, action: 'request', targetAccountId: owner.user },
        CONTEXT,
      );
      expect((await identityPreviews(friend.user, [owner.user], CONTEXT)).get(owner.user).note).toBe('');
      await updateFriendship(
        { accountId: owner.user, action: 'accept', friendshipId: pending.friend.friendshipId },
        CONTEXT,
      );
      await play(owner);
      expect((await identityPreviews(friend.user, [owner.user], CONTEXT)).get(owner.user)).toMatchObject({
        note: 'e\u0301 🌲 👩‍👧',
        online: true,
      });
      expect((await identityPreviews(owner.user, [owner.user], CONTEXT)).get(owner.user).note).toBe('e\u0301 🌲 👩‍👧');
      expect((await identityPreviews(stranger.user, [owner.user], CONTEXT)).get(owner.user)).toMatchObject({
        note: '',
        online: false,
        instanceCode: '',
        mapCode: '',
      });
      await model('CyberiaGameSession').updateOne({ user: owner.user }, { expiresAt: new Date(0) });
      expect((await identityPreviews(friend.user, [owner.user], CONTEXT)).get(owner.user)).toMatchObject({
        note: 'e\u0301 🌲 👩‍👧',
        online: false,
      });
      expect((await updateStatusNote({ accountId: owner.user, note: '🌲'.repeat(81) }, CONTEXT)).refusal).toBe(
        'too_long',
      );
      expect((await updateStatusNote({ accountId: owner.user, note: 1 }, CONTEXT)).refusal).toBe('invalid');
    });

    it('names what an account wears in its last played profile, as the served catalog binds it', async () => {
      const ana = await account();
      const bo = await account();
      const cid = (letter) => `bafkrei${letter.repeat(52)}`;
      const definition = (key, type, rendered = true) => ({
        cid: key,
        contentHash: `hash-${key}`,
        data: {
          item: { id: key, type },
          ...(rendered ? { render: { cid: `${key}-r`, metadataCid: `${key}-m` } } : {}),
        },
      });
      await model('ObjectLayer').collection.insertMany([
        definition(cid('a'), 'skin'),
        definition(cid('b'), 'skin'),
        definition(cid('c'), 'weapon'),
        definition(cid('d'), 'consumable', false),
      ]);
      // The catalog moved the skin label to a newer definition than the one the stack was granted with.
      await model('CyberiaItemCatalog').collection.insertOne({ itemId: 'skin-x', objectLayerCid: cid('b') });
      const worn = (itemId, olCid, slot) => ({ ...stack(itemId, slot, 1, olCid), active: true });
      await model('CyberiaPlayer').create([
        { user: ana.user, universeCode: 'old', lastPlayedAt: new Date(1000), bag: [worn('skin-x', cid('a'), 0)] },
        {
          user: ana.user,
          universeCode: 'u1',
          lastPlayedAt: new Date(2000),
          bag: [
            worn('skin-x', cid('a'), 0),
            worn('gun', cid('c'), 1),
            worn('potion', cid('d'), 2),
            stack('gun', 3, 1, cid('c')),
          ],
        },
      ]);
      const sent = await updateFriendship(
        { accountId: ana.user, action: 'request', targetAccountId: bo.user },
        CONTEXT,
      );
      const avatar = appearanceReference([cid('b'), cid('c')]);
      expect((await identityPreviews(bo.user, [ana.user], CONTEXT)).get(ana.user).avatar).toBe(avatar);
      expect((await listFriends({ accountId: bo.user }, CONTEXT)).friends).toEqual([
        expect.objectContaining({ friendshipId: sent.friend.friendshipId, avatar }),
      ]);
      expect((await identityPreviews(ana.user, [bo.user], CONTEXT)).get(bo.user).avatar).toBe('');

      const app = express();
      app.use('/player', CyberiaPlayerRouter.router({ ...CONTEXT, authMiddleware: authMiddlewareFactory(CONTEXT) }));
      const http = await new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
      });
      try {
        const base = `http://127.0.0.1:${http.address().port}/player`;
        const named = await fetch(
          `${base}/identity/${encodeURIComponent((await model('User').findById(ana.user)).username)}`,
          {
            redirect: 'manual',
          },
        );
        expect([named.status, named.headers.get('location'), named.headers.get('cache-control')]).toEqual([
          302,
          avatar,
          'no-cache',
        ]);
        expect((await fetch(`${base}/identity/nobody`, { redirect: 'manual' })).status).toBe(404);
        const refused = await fetch(`${base}/appearance/v1/file:..%2Fsecret`);
        expect([refused.status, refused.headers.get('cache-control')]).toEqual([400, 'no-store']);
      } finally {
        await new Promise((resolve) => http.close(resolve));
      }
    });

    it('requests, accepts, lists with presence and removes by account', async () => {
      const ana = await account();
      const bo = await account({ publicProfile: false });
      const sent = await updateFriendship(
        { accountId: ana.user, action: 'request', targetAccountId: bo.user },
        CONTEXT,
      );
      expect(sent.friend).toMatchObject({ status: 'outgoing', accountId: bo.user, online: false });
      expect((await listFriends({ accountId: bo.user }, CONTEXT)).friends).toEqual([
        expect.objectContaining({ status: 'incoming', accountId: ana.user, expiresAtMs: expect.any(Number) }),
      ]);
      expect(
        await updateFriendship({ accountId: ana.user, action: 'request', targetAccountId: bo.user }, CONTEXT),
      ).toEqual({
        refusal: 'exists',
      });
      expect(
        await updateFriendship(
          { accountId: ana.user, action: 'accept', friendshipId: sent.friend.friendshipId },
          CONTEXT,
        ),
      ).toEqual({ refusal: 'not_found' });

      const accepted = await updateFriendship(
        { accountId: bo.user, action: 'accept', friendshipId: sent.friend.friendshipId },
        CONTEXT,
      );
      expect(accepted.friend).toMatchObject({ status: 'friend', accountId: ana.user });

      await play(ana);
      await model('CyberiaGameSession').updateOne({ user: ana.user }, { mapCode: 'm9' });
      const [row] = (await listFriends({ accountId: bo.user }, CONTEXT)).friends;
      expect(row).toMatchObject({ status: 'friend', online: true, instanceCode: 'w1', mapCode: 'm9' });
      expect(JSON.stringify(row)).not.toContain('@cyberia.test');

      await updateFriendship({ accountId: ana.user, action: 'remove', friendshipId: row.friendshipId }, CONTEXT);
      expect((await listFriends({ accountId: bo.user }, CONTEXT)).friends).toEqual([]);
    });

    it('turns a crossed request into a friendship and refuses self, unknown and too many requests', async () => {
      const ana = await account();
      const bo = await account();
      await updateFriendship({ accountId: ana.user, action: 'request', targetAccountId: bo.user }, CONTEXT);
      const crossed = await updateFriendship(
        { accountId: bo.user, action: 'request', targetAccountId: ana.user },
        CONTEXT,
      );
      expect(crossed.friend.status).toBe('friend');

      expect(
        (await updateFriendship({ accountId: ana.user, action: 'request', targetAccountId: ana.user }, CONTEXT))
          .refusal,
      ).toBe('self');
      expect(
        (
          await updateFriendship(
            { accountId: ana.user, action: 'request', targetAccountId: '64a0000000000000000000ff' },
            CONTEXT,
          )
        ).refusal,
      ).toBe('unknown');

      const busy = await account();
      for (let i = 0; i < FRIEND_REQUESTS_MAX; i++) {
        const target = await account();
        expect(
          (await updateFriendship({ accountId: busy.user, action: 'request', targetAccountId: target.user }, CONTEXT))
            .refusal,
        ).toBe('');
      }
      const last = await account();
      expect(
        (await updateFriendship({ accountId: busy.user, action: 'request', targetAccountId: last.user }, CONTEXT))
          .refusal,
      ).toBe('limit');
    });

    it('does not depend on TTL deletion to expire or renew requests', async () => {
      const ana = await account();
      const bo = await account();
      const sent = await updateFriendship(
        { accountId: ana.user, action: 'request', targetAccountId: bo.user },
        CONTEXT,
      );
      const id = sent.friend.friendshipId;
      await model('CyberiaSocial').updateOne({ _id: id }, { expiresAt: new Date(0) });
      expect((await listFriends({ accountId: bo.user }, CONTEXT)).friends).toEqual([]);
      expect(await updateFriendship({ accountId: bo.user, action: 'accept', friendshipId: id }, CONTEXT)).toEqual({
        refusal: 'not_found',
      });
      const renewed = await updateFriendship(
        { accountId: bo.user, action: 'request', targetAccountId: ana.user },
        CONTEXT,
      );
      expect(renewed.refusal).toBe('');
      expect(renewed.friend.friendshipId).not.toBe(id);
      const results = await Promise.all(
        [1, 2].map(() =>
          updateFriendship(
            {
              accountId: ana.user,
              action: 'accept',
              friendshipId: renewed.friend.friendshipId,
            },
            CONTEXT,
          ),
        ),
      );
      expect(results.filter(({ refusal }) => !refusal)).toHaveLength(1);
      const stored = await model('CyberiaSocial').findById(renewed.friend.friendshipId).lean();
      expect(stored.status).toBe('accepted');
      expect(stored).not.toHaveProperty('expiresAt');
      expect(await model('CyberiaSocial').countDocuments({ expiresAt: { $lte: new Date() } })).toBe(0);
      for (const user of [ana.user, bo.user])
        expect((await listFriends({ accountId: user }, CONTEXT)).friends[0].status).toBe('friend');
    });

    it('keeps one pair under concurrent requests and normalizes account IDs', async () => {
      const ana = await account();
      const bo = await account();
      expect(
        await updateFriendship(
          { accountId: ana.user, action: 'request', targetAccountId: ana.user.toUpperCase() },
          CONTEXT,
        ),
      ).toEqual({ refusal: 'self' });
      const results = await Promise.all(
        [ana, bo, ana, bo].map((actor) =>
          updateFriendship(
            {
              accountId: actor.user,
              action: 'request',
              targetAccountId: actor === ana ? bo.user : ana.user,
            },
            CONTEXT,
          ),
        ),
      );
      expect(results.every(({ refusal }) => ['', 'exists', 'not_found'].includes(refusal))).toBe(true);
      const links = await model('CyberiaSocial')
        .find({ $or: [{ low: ana.user }, { high: ana.user }] })
        .lean();
      expect(links).toHaveLength(1);
      expect(String(links[0].low) < String(links[0].high)).toBe(true);
    });

    it('keeps identities when profiles or presence are absent and omits deleted accounts', async () => {
      const ana = await account();
      const bo = await account();
      await updateFriendship({ accountId: ana.user, action: 'request', targetAccountId: bo.user }, CONTEXT);
      await updateFriendship({ accountId: bo.user, action: 'request', targetAccountId: ana.user }, CONTEXT);
      const presence = vi.spyOn(model('CyberiaGameSession'), 'find').mockImplementationOnce(() => {
        throw new Error('Presence unavailable');
      });
      try {
        expect((await listFriends({ accountId: ana.user }, CONTEXT)).friends).toEqual([
          expect.objectContaining({ name: expect.any(String), note: '', online: false, mapCode: '' }),
        ]);
      } finally {
        presence.mockRestore();
      }
      await model('User').deleteOne({ _id: bo.user });
      expect((await listFriends({ accountId: ana.user }, CONTEXT)).friends).toEqual([]);
    });

    it('keeps one clean status note per account, shown to its friends only, changed at most once per interval', async () => {
      const ana = await account();
      const bo = await account();
      const cy = await account();
      const sent = await updateFriendship(
        { accountId: ana.user, action: 'request', targetAccountId: bo.user },
        CONTEXT,
      );
      await updateFriendship({ accountId: bo.user, action: 'accept', friendshipId: sent.friend.friendshipId }, CONTEXT);
      await updateFriendship({ accountId: cy.user, action: 'request', targetAccountId: ana.user }, CONTEXT);

      expect(
        await updateStatusNote({ accountId: ana.user, note: '  Out\u0007 farming   wood \u200b' }, CONTEXT),
      ).toMatchObject({
        refusal: '',
        note: 'Out farming wood',
      });
      expect((await listFriends({ accountId: ana.user }, CONTEXT)).note).toBe('Out farming wood');
      const rowOf = async (viewer, other) =>
        (await listFriends({ accountId: viewer.user }, CONTEXT)).friends.find(
          ({ accountId }) => accountId === other.user,
        );
      expect((await rowOf(bo, ana)).note).toBe('Out farming wood');
      expect((await rowOf(cy, ana)).note).toBe('');

      expect((await updateStatusNote({ accountId: ana.user, note: 'again' }, CONTEXT)).refusal).toBe('too_soon');
      expect((await updateStatusNote({ accountId: bo.user, note: 'x'.repeat(81) }, CONTEXT)).refusal).toBe('too_long');
      await model('CyberiaSocialProfile').updateOne({ user: ana.user }, { noteUpdatedAt: new Date(0) });
      expect(await updateStatusNote({ accountId: ana.user, note: '' }, CONTEXT)).toMatchObject({
        refusal: '',
        note: '',
      });
      expect((await rowOf(bo, ana)).note).toBe('');
    });
  });

  describe('maintenance', () => {
    it('reports held stacks and rebinds them only for profiles out of a session', async () => {
      const offline = await account();
      const online = await account();
      const held = [
        { stack: stack('lamp', 0, 2, 'cid-lamp-v1'), container: 'bag', actionCode: '', reason: 'rebound' },
        { stack: stack('lamp', 1, 1, 'cid-lamp-v1'), container: 'vault', actionCode: 'bank', reason: 'rebound' },
      ];
      for (const who of [offline, online]) {
        const session = await play(who);
        await commitState(
          {
            playerId: session.playerId,
            epoch: session.epoch,
            seq: 1,
            state: { ...emptyState(), held },
            questsChanged: false,
            positionChanged: false,
          },
          CONTEXT,
        );
        if (who === offline)
          await releaseSession({ playerId: session.playerId, accountId: who.user, epoch: session.epoch }, CONTEXT);
      }
      const report = await heldReport(model('CyberiaPlayer'), { universeCode: 'u1' });
      expect(report).toContainEqual(
        expect.objectContaining({
          universeCode: 'u1',
          instanceCode: '',
          itemId: 'lamp',
          olCid: 'cid-lamp-v1',
          reason: 'rebound',
          stacks: 2,
          units: 4,
          profiles: 2,
        }),
      );
      expect(report).toContainEqual(
        expect.objectContaining({ instanceCode: 'w1', itemId: 'lamp', stacks: 2, units: 2, profiles: 2 }),
      );
      const models = { Player: model('CyberiaPlayer'), GameSession: model('CyberiaGameSession') };
      expect(await rebindHeld(models, { itemId: 'lamp', olCid: 'cid-lamp-v2' })).toEqual({
        profiles: 1,
        stacks: 2,
        live: 1,
        applied: false,
      });
      expect(await rebindHeld(models, { itemId: 'lamp', olCid: 'cid-lamp-v2', apply: true })).toMatchObject({
        profiles: 1,
        live: 1,
      });
      const after = await model('CyberiaPlayer')
        .find({ 'held.stack.itemId': 'lamp' }, { user: 1, held: 1, worlds: 1 })
        .lean();
      const cidsOf = (who) => {
        const profile = after.find((p) => String(p.user) === who.user);
        return [profile.held[0].stack.olCid, profile.worlds[0].held[0].stack.olCid];
      };
      expect(cidsOf(offline)).toEqual(['cid-lamp-v2', 'cid-lamp-v2']);
      expect(cidsOf(online)).toEqual(['cid-lamp-v1', 'cid-lamp-v1']);
    });

    it('names the definition of every stack a profile keeps, in every container and world', async () => {
      const who = await account();
      await model('CyberiaPlayer').create({
        user: who.user,
        universeCode: 'owned',
        bag: [stack('a', 0, 1, 'cid-bag')],
        storage: [stack('b', 0, 1, 'cid-storage')],
        held: [{ stack: stack('c', 1, 1, 'cid-held'), container: 'storage', reason: 'unknown' }],
        worlds: [
          {
            instanceCode: 'w1',
            vaults: [{ actionCode: 'bank', stacks: [stack('d', 0, 1, 'cid-vault')] }],
            held: [
              { stack: stack('e', 1, 1, 'cid-vault-held'), container: 'vault', actionCode: 'bank', reason: 'no_room' },
            ],
          },
        ],
      });
      const owned = await model('CyberiaPlayer').ownedDefinitionCids();
      expect(owned).toEqual(
        expect.arrayContaining(['cid-bag', 'cid-storage', 'cid-held', 'cid-vault', 'cid-vault-held', 'cid-lamp-v1']),
      );
      expect(owned).not.toContain('');
      expect(new Set(owned).size).toBe(owned.length);
    });
  });

  describe('gRPC', () => {
    let server;
    let client;

    beforeAll(async () => {
      server = new grpc.Server();
      server.addService(cyberiaProto.CyberiaPlayerService.service, buildPlayerHandlers(CONTEXT));
      const port = await new Promise((resolve, reject) =>
        server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, bound) =>
          err ? reject(err) : resolve(bound),
        ),
      );
      client = new cyberiaProto.CyberiaPlayerService(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
    });

    afterAll(() => {
      client?.close();
      server?.forceShutdown();
    });

    const call = (method, request, key) => {
      const metadata = new grpc.Metadata();
      if (key) metadata.set('x-cyberia-server-api-key', key);
      return new Promise((resolve, reject) =>
        client[method](request, metadata, (err, res) => (err ? reject(err) : resolve(res))),
      );
    };

    it('refuses a call without the server key and serves one with it', async () => {
      const who = await account();
      const { ticket } = await createGameTicket({ ...who, instanceCode: 'w1' }, CONTEXT);
      const request = { ticket, instanceCode: 'w1', connectionId: 'grpc-1', serverId: 's' };
      await expect(call('consumeGameLaunchTicket', request, 'wrong')).rejects.toMatchObject({
        code: grpc.status.UNAUTHENTICATED,
      });
      expect(await call('consumeGameLaunchTicket', request, SERVER_KEY)).toMatchObject({
        refusal: '',
        accountId: who.user,
      });
      const acquired = await call(
        'acquirePlayerSession',
        { connectionId: 'grpc-1', instanceCode: 'w1', serverId: 's' },
        SERVER_KEY,
      );
      expect(acquired).toMatchObject({ refusal: '', epoch: 1, created: true });
      expect(acquired.state.position).toMatchObject({ mapCode: '' });
    });

    it('protects note writes and returns the stored Unicode note and next update time', async () => {
      const owner = await account();
      const request = { accountId: owner.user, note: 'e\u0301 🌲 👩‍👧' };
      await expect(call('updateStatusNote', request)).rejects.toMatchObject({ code: grpc.status.UNAUTHENTICATED });
      expect(await call('updateStatusNote', request, SERVER_KEY)).toMatchObject({ refusal: '', note: request.note });
      const refused = await call('updateStatusNote', { ...request, note: '' }, SERVER_KEY);
      expect(refused.refusal).toBe('too_soon');
      expect(Number(refused.nextUpdateAtMs)).toBeGreaterThan(Date.now());
      expect(await call('listFriends', { accountId: owner.user }, SERVER_KEY)).toMatchObject({ note: request.note });
    });
  });
});
