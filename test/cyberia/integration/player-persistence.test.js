/**
 * Accounts, guests, launch and resume tickets, gameplay sessions and their handover, universe profiles across
 * worlds, player state commits, the index contract, the operator view, friendships and status notes against a
 * real MongoDB replica set: the transactions, the unique indexes and the atomic consumption run for real. Guest identities live in a memory stand-in
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
import { commitState, commitStates } from '../../../src/projects/cyberia/player/player-state.js';
import { listWorldDrops } from '../../../src/projects/cyberia/player/world-drops.js';
import {
  acquireSession,
  checkpointSessions,
  consumeLaunch,
  issueResume,
  issueTravel,
  releaseSession,
} from '../../../src/projects/cyberia/player/player-session.js';
import { listFriends, updateFriendship, updateStatusNote } from '../../../src/projects/cyberia/player/social.js';
import { identityPreviews } from '../../../src/projects/cyberia/player/identity.js';
import { DEFAULT_INSTANCE_CODE } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { FRIEND_REQUESTS_MAX } from '../../../src/api/cyberia-social/social-contract.js';
import { heldReport, rebindHeld } from '../../../src/projects/cyberia/player/player-maintenance.js';
import { buildPlayerHandlers, cyberiaProto } from '../../../src/grpc/cyberia/grpc-server.js';
import {
  runtimeModels,
  syncRuntimeIndexes,
  unkeyedFilter,
} from '../../../src/projects/cyberia/runtime/runtime-indexes.js';
import { CYBERIA_RUNTIME_APIS } from '../../../src/projects/cyberia/stack/domain-ownership.js';
import { listPlayers, playerAudit, playerDetail } from '../../../src/projects/cyberia/player/player-admin.js';
import { endSession } from '../../../src/projects/cyberia/player/player-operations.js';
import { WORLD_DROP_RECORD_DAYS } from '../../../src/api/cyberia-world-drop/cyberia-world-drop.model.js';
import { reportServer } from '../../../src/api/cyberia-server-registry/cyberia-server-registry.service.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { memoryValkey } from '../../support/valkey-memory.js';
import { emptyState, playerSessions, stack } from '../../support/player-sessions.js';

vi.mock('../../../src/db/valkey/Valkey.js', async () =>
  (await import('../../support/valkey-memory.js')).memoryValkeyModule(),
);

const CONTEXT = { host: 'www.cyberia.test', path: '/' };
const APIS = [
  'user',
  'file',
  'cyberia-instance',
  'cyberia-market',
  'object-layer',
  'cyberia-item-catalog',
  ...CYBERIA_RUNTIME_APIS,
];
const SERVER_KEY = 'player-test-server-key';
const model = (name) => DataBaseProviderService.getModel(name, CONTEXT);

const { account, guest, launch, play } = playerSessions(CONTEXT);

let reports = 0;
/** One report of a game server process of a world: it takes sessions until it drains. */
const serve = (instanceCode, state = 'ready', serverId = `server-${instanceCode}`) =>
  reportServer(
    { serverId, url: `http://localhost:8083/${instanceCode}`, instanceCode, state, seq: ++reports },
    CONTEXT,
  );

/** One checkpoint of a gameplay session, with the health its server reports. */
const report = (session, who, health) =>
  checkpointSessions(
    { sessions: [{ playerId: session.playerId, accountId: who.user, epoch: session.epoch, health }] },
    CONTEXT,
  );

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
      'CyberiaPlayerAudit',
      'CyberiaGameSession',
      'CyberiaGameTicket',
      'CyberiaSocial',
      'CyberiaSocialProfile',
      'CyberiaQuestProgress',
      'CyberiaUniverse',
      'CyberiaServerRegistry',
      'CyberiaEconomyOperation',
      'CyberiaWorldDrop',
      'CyberiaMarketListing',
      'CyberiaMarketClaim',
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

  describe('joint commits', () => {
    const commitOf = (session, seq, state) => ({
      playerId: session.playerId,
      epoch: session.epoch,
      seq,
      state,
      questsChanged: false,
      positionChanged: false,
    });
    const saved = async (session) => (await model('CyberiaPlayer').findById(session.playerId).lean());

    it('applies the states of both players and the operation record in one transaction, once', async () => {
      const [a, b] = [await play(await account()), await play(await account())];
      const request = {
        operationId: `trade-${a.playerId}-1`,
        kind: 'trade',
        commits: [
          commitOf(a, 1, { ...emptyState(), coins: 6, bag: [stack('knife', 0)] }),
          commitOf(b, 1, { ...emptyState(), coins: 24, bag: [stack('gel', 0, 2)] }),
        ],
      };
      expect(await commitStates(request, CONTEXT)).toEqual({ refusal: '', playerId: '', duplicate: false });
      expect((await saved(a)).bag).toMatchObject([{ itemId: 'knife', olCid: 'cid-knife' }]);
      expect((await saved(b)).coins).toBe(24);
      const record = await model('CyberiaEconomyOperation').findOne({ operationId: request.operationId }).lean();
      expect(record).toMatchObject({ kind: 'trade', instanceCode: 'w1', seqs: [1, 1] });
      expect(record.players.map(String)).toEqual([a.playerId, b.playerId]);

      expect(await commitStates(request, CONTEXT)).toEqual({ refusal: '', playerId: '', duplicate: true });
      const reused = { ...request, commits: [request.commits[0], commitOf(b, 2, { ...emptyState(), coins: 99 })] };
      expect(await commitStates(reused, CONTEXT)).toMatchObject({ refusal: 'invalid' });
      expect((await saved(b)).coins).toBe(24);
    });

    it('applies no state when one player is stale, and names that player', async () => {
      const whoB = await account();
      const [a, b] = [await play(await account()), await play(whoB)];
      await play(whoB);
      const result = await commitStates(
        {
          operationId: `trade-${a.playerId}-2`,
          kind: 'trade',
          commits: [commitOf(a, 1, { ...emptyState(), coins: 1 }), commitOf(b, 1, { ...emptyState(), coins: 2 })],
        },
        CONTEXT,
      );
      expect(result).toEqual({ refusal: 'stale_session', playerId: b.playerId, duplicate: false });
      expect((await saved(a)).commitSeq).toBe(0);
      expect(await model('CyberiaEconomyOperation').countDocuments({ operationId: `trade-${a.playerId}-2` })).toBe(0);
    });

    it('refuses a request that joins one player, another kind or a malformed state', async () => {
      const a = await play(await account());
      const one = commitOf(a, 1, emptyState());
      const two = commitOf(await play(await account()), 1, emptyState());
      const drop = { mapCode: 'm', x: 1, y: 1, itemId: 'gel', olCid: '', quantity: 1, lifetimeMs: 1000 };
      for (const request of [
        { operationId: 'op-x', kind: 'trade', commits: [one, one] },
        { operationId: 'op-y', kind: 'gift', commits: [one, two] },
        { operationId: '', kind: 'trade', commits: [] },
        { operationId: 'op-t', kind: 'trade', commits: [one, two], drop },
        { operationId: 'op-d', kind: 'drop', commits: [one] },
        { operationId: 'op-e', kind: 'drop', commits: [one, two], drop },
        { operationId: 'op-f', kind: 'drop', commits: [one], drop: { ...drop, lifetimeMs: 86400001 } },
        { operationId: 'op-g', kind: 'drop', commits: [one], drop: { ...drop, quantity: 0 } },
        { operationId: 'op-p', kind: 'pickup', commits: [one] },
        { operationId: 'op-q', kind: 'pickup', commits: [one], claimDropId: 'x', drop },
      ])
        expect(await commitStates(request, CONTEXT)).toMatchObject({ refusal: 'invalid' });
      expect(await model('CyberiaWorldDrop').countDocuments({ dropId: /^op-/ })).toBe(0);
    });

    const listed = async (instanceCode) => (await listWorldDrops({ instanceCode }, CONTEXT)).drops;

    it('creates a world drop with the state of its owner, and a pickup claims it once', async () => {
      const [a, b] = [await play(await account()), await play(await account())];
      const drop = {
        operationId: `drop-${a.playerId}`,
        kind: 'drop',
        commits: [commitOf(a, 1, { ...emptyState(), bag: [stack('gel', 0, 1)] })],
        drop: { mapCode: 'm1', x: 2, y: 3, itemId: 'gel', olCid: 'cid-gel', quantity: 2, lifetimeMs: 60000 },
      };
      expect(await commitStates(drop, CONTEXT)).toEqual({ refusal: '', playerId: '', duplicate: false });
      expect(await commitStates(drop, CONTEXT)).toEqual({ refusal: '', playerId: '', duplicate: true });
      expect((await saved(a)).bag).toMatchObject([{ itemId: 'gel', quantity: 1 }]);
      const [record] = (await listed('w1')).filter(({ dropId }) => dropId === drop.operationId);
      expect(record).toMatchObject({
        mapCode: 'm1',
        x: 2,
        y: 3,
        olCid: 'cid-gel',
        quantity: 2,
        ownerPlayerId: a.playerId,
      });
      expect(record.expiresAtMs).toBeGreaterThan(Date.now() + 55000);
      expect(await listed('w2')).toEqual([]);

      const pickup = (session, seq) => ({
        operationId: `pickup-${session.playerId}-${seq}`,
        kind: 'pickup',
        commits: [commitOf(session, seq, { ...emptyState(), bag: [stack('gel', 0, 2)] })],
        claimDropId: drop.operationId,
      });
      expect(await commitStates(pickup(b, 1), CONTEXT)).toEqual({ refusal: '', playerId: '', duplicate: false });
      expect((await saved(b)).bag).toMatchObject([{ itemId: 'gel', quantity: 2 }]);
      const claimed = await model('CyberiaWorldDrop').findOne({ dropId: drop.operationId }).lean();
      expect(claimed).toMatchObject({ status: 'claimed', instanceCode: 'w1' });
      expect(String(claimed.claimedBy)).toBe(b.playerId);

      expect(await commitStates(pickup(a, 2), CONTEXT)).toEqual({
        refusal: 'drop_gone',
        playerId: a.playerId,
        duplicate: false,
      });
      expect((await saved(a)).commitSeq).toBe(1);
      expect((await listed('w1')).map(({ dropId }) => dropId)).not.toContain(drop.operationId);
    });

    it('never claims an expired drop, a drop of another world or an unknown one', async () => {
      const a = await play(await account());
      const record = { mapCode: 'm', x: 0, y: 0, itemId: 'gel', quantity: 1, owner: a.playerId };
      await model('CyberiaWorldDrop').create([
        { ...record, dropId: `old-${a.playerId}`, instanceCode: 'w1', expiresAt: new Date(Date.now() - 1000) },
        { ...record, dropId: `far-${a.playerId}`, instanceCode: 'w2', expiresAt: new Date(Date.now() + 60000) },
      ]);
      for (const [i, claimDropId] of [`old-${a.playerId}`, `far-${a.playerId}`, 'none'].entries())
        expect(
          await commitStates(
            {
              operationId: `claim-${a.playerId}-${i}`,
              kind: 'pickup',
              commits: [commitOf(a, i + 1, emptyState())],
              claimDropId,
            },
            CONTEXT,
          ),
        ).toMatchObject({ refusal: 'drop_gone', playerId: a.playerId });
      expect((await saved(a)).commitSeq).toBe(0);
      expect((await listed('w1')).map(({ dropId }) => dropId)).not.toContain(`old-${a.playerId}`);
      expect(await model('CyberiaEconomyOperation').countDocuments({ operationId: /^claim-/ })).toBe(0);
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

  describe('session handover', () => {
    const acquireOn = (connectionId, serverId) =>
      acquireSession({ connectionId, instanceCode: 'w1', serverId }, CONTEXT);

    it('stores the health a checkpoint reports, bounded to the vocabulary of the lease', async () => {
      const who = await account();
      const live = await play(who);
      await report(live, who, {
        durability: 'degraded',
        seq: 5,
        durableSeq: 3,
        unsavedMs: 16000,
        failure: 'transport',
      });
      expect((await model('CyberiaGameSession').findOne({ user: who.user }).lean()).health).toMatchObject({
        durability: 'degraded',
        closing: false,
        seq: 5,
        durableSeq: 3,
        unsavedMs: 16000,
        failure: 'transport',
        at: expect.any(Date),
      });
      await report(live, who, { durability: 'lost', failure: 'oops' });
      expect((await model('CyberiaGameSession').findOne({ user: who.user }).lean()).health).toMatchObject({
        durability: 'saved',
        failure: '',
      });
    });

    it('holds an acquisition on another server back while the left session closes unsaved', async () => {
      const who = await account();
      const left = await play(who);
      await report(left, who, { durability: 'saving', closing: true, seq: 4, durableSeq: 3, unsavedMs: 900 });
      const { connectionId } = await launch(who);
      expect(await acquireOn(connectionId, 'server-b')).toEqual({ refusal: 'saving' });
      expect(await model('CyberiaPlayer').findById(left.playerId, 'epoch').lean()).toMatchObject({ epoch: left.epoch });
      expect(await acquireOn(connectionId, 'server-a')).toMatchObject({ refusal: '', epoch: left.epoch + 1 });
    });

    it('fences at once a session its server reports it cannot save', async () => {
      const who = await account();
      const left = await play(who);
      await report(left, who, { durability: 'recovery', closing: true, seq: 9, durableSeq: 3, failure: 'integrity' });
      const { connectionId } = await launch(who);
      expect(await acquireOn(connectionId, 'server-b')).toMatchObject({ refusal: '', epoch: left.epoch + 1 });
      const late = { playerId: left.playerId, epoch: left.epoch, seq: 9, state: emptyState() };
      expect(await commitState({ ...late, questsChanged: false, positionChanged: false }, CONTEXT)).toMatchObject({
        refusal: 'stale_session',
      });
    });

    it('lets a resume wait only for a session that may still write on another server', async () => {
      const who = await account();
      const live = await play(who);
      const { ticket } = await issueResume(
        { playerId: live.playerId, accountId: who.user, epoch: live.epoch, instanceCode: 'w1' },
        CONTEXT,
      );
      const resume = (serverId) =>
        consumeLaunch({ ticket, instanceCode: 'w1', connectionId: 'resume-x', serverId }, CONTEXT);
      expect(await resume('server-b')).toEqual({ refusal: 'busy' });
      expect(await resume('server-a')).toMatchObject({ refusal: '', principal: 'account', accountId: who.user });
    });
  });

  describe('operator view', () => {
    const admin = () => new mongoose.Types.ObjectId();
    const end = (session, extra = {}) =>
      endSession(
        {
          playerId: session.playerId,
          operationId: `op-${session.playerId}-${extra.epoch ?? session.epoch}`,
          reason: 'Stuck session reported by the player',
          epoch: session.epoch,
          actor: extra.actor ?? actor,
          ...extra,
        },
        CONTEXT,
      );
    let actor;
    beforeEach(() => {
      actor = admin();
    });

    it('pages profiles by their last play with the account name and the session, and filters them', async () => {
      const who = await account();
      const live = await play(who);
      await report(live, who);
      const offline = await account();
      const away = await play(offline);
      await releaseSession({ playerId: away.playerId, accountId: offline.user, epoch: away.epoch }, CONTEXT);

      const first = await listPlayers({ limit: 1 }, CONTEXT);
      expect(first.data).toHaveLength(1);
      expect(first.next).toMatch(/^\d+_[0-9a-f]{24}$/);
      const second = await listPlayers({ limit: 1, after: first.next }, CONTEXT);
      expect(second.data[0].id).not.toBe(first.data[0].id);

      const { username } = await model('User').findById(who.user).lean();
      const [row] = (await listPlayers({ q: username }, CONTEXT)).data;
      expect(row).toMatchObject({
        id: live.playerId,
        accountId: who.user,
        username,
        universeCode: 'u1',
        status: 'online',
        session: { instanceCode: 'w1', serverId: 'server-a', live: true, health: { durability: 'saved' } },
      });
      expect(row).not.toHaveProperty('bag');
      const [gone] = (await listPlayers({ q: offline.user }, CONTEXT)).data;
      expect(gone).toMatchObject({ id: away.playerId, status: 'offline', session: null });
      const online = (await listPlayers({ status: 'online', limit: 50 }, CONTEXT)).data.map(({ id }) => id);
      expect(online).toContain(live.playerId);
      expect(online).not.toContain(away.playerId);
    });

    it('shows the counts of a profile in each world, never its goods', async () => {
      const who = await account();
      const live = await play(who);
      await commitState(
        {
          playerId: live.playerId,
          epoch: live.epoch,
          seq: 1,
          state: {
            ...emptyState(),
            bag: [stack('sword', 0)],
            quests: [{ questCode: 'q-detail', status: 'completed', steps: [], startedAtMs: 1, completedAtMs: 2 }],
          },
          questsChanged: true,
          positionChanged: false,
        },
        CONTEXT,
      );
      const detail = await playerDetail(live.playerId, CONTEXT);
      expect(detail).toMatchObject({
        id: live.playerId,
        schemaCurrent: true,
        carried: { bag: 1, storage: 0, held: 0 },
        worlds: [{ instanceCode: 'w1', quests: { active: 0, completed: 1 } }],
      });
      expect(JSON.stringify(detail)).not.toContain('sword');
      await expect(playerDetail('nope', CONTEXT)).rejects.toMatchObject({ status: 400 });
      await expect(playerDetail(String(new mongoose.Types.ObjectId()), CONTEXT)).rejects.toMatchObject({ status: 404 });
    });

    it('ends a live session once, fences its writes, ends it at its next checkpoint and records every request', async () => {
      const who = await account();
      const live = await play(who);
      await report(live, who, {
        durability: 'degraded',
        seq: 7,
        durableSeq: 5,
        unsavedMs: 20000,
        failure: 'transport',
      });

      expect(await end(live, { epoch: live.epoch + 3, operationId: 'op-stale-view' })).toMatchObject({
        outcome: 'refused',
        refusal: 'changed',
      });
      const done = await end(live);
      expect(done).toMatchObject({ outcome: 'done', refusal: '', epoch: live.epoch + 1 });
      expect(await end(live)).toEqual(done);
      await expect(end(live, { actor: admin() })).rejects.toMatchObject({ status: 409 });
      await expect(end(live, { reason: 'no' })).rejects.toMatchObject({ status: 400 });

      expect(await report(live, who)).toEqual({ ended: [{ playerId: live.playerId, reason: 'ended' }] });
      const late = { playerId: live.playerId, epoch: live.epoch, seq: 8, state: emptyState() };
      expect(await commitState({ ...late, questsChanged: false, positionChanged: false }, CONTEXT)).toMatchObject({
        refusal: 'stale_session',
      });
      expect(
        (
          await issueResume(
            { playerId: live.playerId, accountId: who.user, epoch: live.epoch, instanceCode: 'w1' },
            CONTEXT,
          )
        ).refusal,
      ).toBe('ended');
      expect((await listPlayers({ q: who.user }, CONTEXT)).data[0]).toMatchObject({ status: 'offline' });

      const trail = await playerAudit({ player: live.playerId }, CONTEXT);
      expect(trail.data.map(({ outcome, refusal }) => [outcome, refusal])).toEqual([
        ['done', ''],
        ['refused', 'changed'],
      ]);
      expect(trail.data[0]).toMatchObject({
        action: 'session.end',
        reason: 'Stuck session reported by the player',
        epochBefore: live.epoch,
        epochAfter: live.epoch + 1,
        session: { serverId: 'server-a', durability: 'degraded', seq: 7, durableSeq: 5 },
      });
      expect(await end({ ...live, epoch: live.epoch + 1 }, { operationId: 'op-no-session' })).toMatchObject({
        outcome: 'refused',
        refusal: 'no_session',
      });

      const next = await play(who);
      expect(next.epoch).toBe(live.epoch + 2);
      expect(await model('CyberiaGameSession').findOne({ user: who.user }).lean()).toMatchObject({ endedBy: null });
    });

    it('lets moderators read and only an admin end a session', async () => {
      const who = await account();
      const live = await play(who);
      const app = express();
      app.use(express.json());
      app.use('/player', CyberiaPlayerRouter.router({ ...CONTEXT, authMiddleware: authMiddlewareFactory(CONTEXT) }));
      const http = await new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
      });
      try {
        const base = `http://127.0.0.1:${http.address().port}/player`;
        const as = (role) => ({
          Authorization: `Bearer ${jwtSign({ _id: String(new mongoose.Types.ObjectId()), role }, CONTEXT, 5, 10)}`,
          'Content-Type': 'application/json',
        });
        const body = JSON.stringify({
          operationId: `op-rest-${live.playerId}`,
          reason: 'Operator test',
          epoch: live.epoch,
        });
        expect((await fetch(`${base}/`)).status).toBe(401);
        expect((await fetch(`${base}/`, { headers: as('user') })).status).toBe(403);
        const page = await (await fetch(`${base}/?limit=2`, { headers: as('moderator') })).json();
        expect(page.data.data.length).toBeLessThanOrEqual(2);
        expect((await fetch(`${base}/${live.playerId}`, { headers: as('moderator') })).status).toBe(200);
        const ends = `${base}/${live.playerId}/session/end`;
        expect((await fetch(ends, { method: 'POST', headers: as('moderator'), body })).status).toBe(403);
        const ended = await (await fetch(ends, { method: 'POST', headers: as('admin'), body })).json();
        expect(ended.data).toMatchObject({ outcome: 'done', epoch: live.epoch + 1 });
      } finally {
        await new Promise((resolve) => http.close(resolve));
      }
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
    const sync = async (apply = true) => await syncRuntimeIndexes(runtimeModels(CONTEXT), { apply });
    const of = (result, name) => result.models.find(({ model: modelName }) => modelName === name);

    it('makes the stored indexes of every runtime model the declared ones, once, and leaves platform indexes', async () => {
      const models = runtimeModels(CONTEXT);
      for (const name of ['CyberiaWorldDrop', 'CyberiaMarketClaim']) await models[name].collection.dropIndexes();
      await models.CyberiaMarketClaim.collection.createIndex({ reason: 1 });
      await model('User').collection.createIndex({ createdAt: 1 }, { name: 'manual_createdAt' });
      const plan = await sync(false);
      expect(plan.ready).toBe(false);
      expect(of(plan, 'CyberiaWorldDrop').toCreate.length).toBeGreaterThan(0);
      expect(of(plan, 'CyberiaMarketClaim').toDrop).toEqual(['reason_1']);

      expect(await sync()).toMatchObject({ ready: true });
      expect(await sync()).toMatchObject({ ready: true });
      const drops = await models.CyberiaWorldDrop.collection.indexes();
      expect(drops.find(({ key }) => key.dropId)?.unique).toBe(true);
      expect(drops.find(({ key }) => key.expiresAt === 1 && !key.status)?.expireAfterSeconds).toBe(
        WORLD_DROP_RECORD_DAYS * 86400,
      );
      const claims = await models.CyberiaMarketClaim.collection.indexes();
      expect(claims.find(({ key }) => key.claimId)?.unique).toBe(true);
      expect(claims.find(({ key }) => key.reason)).toBeUndefined();
      expect((await model('User').collection.indexes()).map(({ name }) => name)).toContain('manual_createdAt');
    });

    it('stops on a record that refuses a declared unique index, names the key, and builds it once that is gone', async () => {
      const Claim = runtimeModels(CONTEXT).CyberiaMarketClaim;
      await Claim.collection.dropIndex('claimId_1');
      const twin = { claimId: 'twin', player: new mongoose.Types.ObjectId(), listingId: 'l', reason: 'sale' };
      await Claim.collection.insertMany([{ ...twin }, { ...twin }]);
      const blocked = await sync();
      expect(blocked.ready).toBe(false);
      expect(of(blocked, 'CyberiaMarketClaim').error).toMatch(/E11000.*claimId.*"twin"/);
      expect(of(blocked, 'CyberiaMarketClaim').toCreate).toEqual([{ claimId: 1 }]);
      await Claim.collection.deleteMany({ claimId: 'twin' });
      expect(await sync()).toMatchObject({ ready: true });
    });

    // The production incident: the unique index of the first quest schema, {playerId, questCode}, was
    // never dropped. A record of the current schema has no playerId, so the index keys it as null and
    // refuses every later player of the same quest. No model declares it, so the sync drops it.
    it('drops a unique index no model declares, which refused the second player of a quest', async () => {
      const QuestProgress = model('CyberiaQuestProgress');
      // The index came first in production: it existed before any record of the current schema.
      await QuestProgress.deleteMany({});
      await QuestProgress.collection.createIndex({ playerId: 1, questCode: 1 }, { unique: true });
      const quest = { questCode: 'buffer-drift-survey', status: 'active', steps: [], startedAtMs: 1, completedAtMs: 0 };
      const commitQuest = (session, seq) =>
        commitState(
          {
            playerId: session.playerId,
            epoch: session.epoch,
            seq,
            state: { ...emptyState(), quests: [quest] },
            questsChanged: true,
            positionChanged: false,
          },
          CONTEXT,
        );
      const first = await play(await account());
      const second = await play(await account());
      expect(await commitQuest(first, 1)).toMatchObject({ refusal: '' });
      expect(await commitQuest(second, 1)).toEqual({ refusal: 'integrity', duplicate: false, revision: 0 });
      expect(of(await sync(false), 'CyberiaQuestProgress').toDrop).toEqual(['playerId_1_questCode_1']);

      expect(await sync()).toMatchObject({ ready: true });
      expect(await commitQuest(second, 2)).toMatchObject({ refusal: '' });
      expect(await QuestProgress.countDocuments({ questCode: quest.questCode })).toBe(2);
    });

    it('deletes the records without a required field of a unique key, then builds the key, once', async () => {
      const models = runtimeModels(CONTEXT);
      const { CyberiaPlayer: Player, CyberiaQuestProgress: QuestProgress } = models;
      const counts = async () => [await Player.countDocuments({}), await QuestProgress.countDocuments({})];
      const kept = await counts();
      const { user } = await Player.findOne({}).lean();
      await Player.collection.dropIndex('user_1_universeCode_1');
      await QuestProgress.collection.dropIndex('player_1_instanceCode_1_questCode_1');
      await Player.collection.insertMany([{ user }, { user, coins: 3 }]);
      await QuestProgress.collection.insertMany([
        { playerId: 'uuid-a', questCode: 'q-legacy', status: 'active' },
        { playerId: 'uuid-b', questCode: 'q-legacy', status: 'completed' },
      ]);
      expect(unkeyedFilter(Player.schema)).toEqual({ $or: [{ user: null }, { universeCode: null }] });
      expect(unkeyedFilter(models.CyberiaUniverse.schema)).toEqual({ $or: [{ code: null }] });

      const plan = await sync(false);
      expect(plan.ready).toBe(false);
      expect(of(plan, 'CyberiaPlayer')).toMatchObject({ deleted: 0, toDelete: 2 });
      expect(of(plan, 'CyberiaQuestProgress')).toMatchObject({ deleted: 0, toDelete: 2 });
      expect(await counts()).toEqual([kept[0] + 2, kept[1] + 2]);

      const synced = await sync();
      expect(synced.ready).toBe(true);
      for (const name of ['CyberiaPlayer', 'CyberiaQuestProgress'])
        expect(of(synced, name)).toMatchObject({ deleted: 2, toDelete: 0, toCreate: [], error: '' });
      expect(await counts()).toEqual(kept);
      expect(await sync()).toMatchObject({ ready: true });
      expect((await sync()).models.every(({ deleted }) => deleted === 0)).toBe(true);
    });

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

    it('carries a world drop and its claim over the wire, and lists what is public', async () => {
      const [a, b] = [await play(await account()), await play(await account())];
      const operationId = `grpc-drop-${a.playerId}`;
      const commit = (session) => ({ playerId: session.playerId, epoch: session.epoch, seq: 1, state: emptyState() });
      const drop = { mapCode: 'm1', x: 4, y: 5, itemId: 'gel', olCid: 'cid-gel', quantity: 3, lifetimeMs: 30000 };
      expect(
        await call('commitPlayerStates', { operationId, kind: 'drop', commits: [commit(a)], drop }, SERVER_KEY),
      ).toMatchObject({ refusal: '', duplicate: false });
      const { drops } = await call('listWorldDrops', { instanceCode: 'w1' }, SERVER_KEY);
      expect(drops.find(({ dropId }) => dropId === operationId)).toMatchObject({ ...drop, lifetimeMs: 0 });
      const pickup = { operationId: `grpc-pick-${b.playerId}`, kind: 'pickup', commits: [commit(b)] };
      expect(await call('commitPlayerStates', { ...pickup, claimDropId: operationId }, SERVER_KEY)).toMatchObject({
        refusal: '',
        duplicate: false,
      });
      await expect(call('listWorldDrops', { instanceCode: 'w1' })).rejects.toMatchObject({
        code: grpc.status.UNAUTHENTICATED,
      });
    });

    it('lists a market operation over the wire and shows it in the market view', async () => {
      await model('CyberiaMarket').create({ code: 'wire', scope: 'instance', hours: [12], fees: { sale: 1 } });
      const seller = await play(await account());
      const market = { marketCode: 'wire', mode: 'auction', itemId: 'gel', olCid: 'cid-gel' };
      const request = {
        operationId: `grpc-list-${seller.playerId}`,
        kind: 'market_list',
        commits: [{ playerId: seller.playerId, epoch: seller.epoch, seq: 1, state: emptyState() }],
        market: { ...market, quantity: 3, price: 20, hours: 12, listingFee: 0, saleFee: 1, sellerName: 'neo' },
      };
      expect(await call('commitPlayerStates', request, SERVER_KEY)).toMatchObject({ refusal: '', duplicate: false });
      const shown = await call(
        'listMarket',
        { instanceCode: 'w1', marketCode: 'wire', playerId: seller.playerId, mode: 'auction' },
        SERVER_KEY,
      );
      expect(shown.listings).toEqual([
        expect.objectContaining({
          itemId: 'gel',
          olCid: 'cid-gel',
          mode: 'auction',
          quantity: 3,
          price: 20,
          minBid: 20,
          mine: true,
        }),
      ]);
      expect(shown.listings[0].endsAtMs).toBeGreaterThan(Date.now() + 11 * 3600000);
      expect(shown).toMatchObject({ next: '', claims: [], scopeKey: 'w1', revision: 1 });
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
