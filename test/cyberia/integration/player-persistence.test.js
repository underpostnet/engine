/**
 * Accounts, guests, launch and resume tickets, gameplay sessions, player state commits and
 * friendships against a real MongoDB replica set: the transactions, the unique indexes and the atomic
 * consumption run for real. Guest identities live in a memory stand-in of Valkey. The player service
 * is also called over a real gRPC server, with and without the server key.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { hashToken } from '../../../src/server/security/auth.js';
import { createGameTicket } from '../../../src/api/cyberia-game-ticket/cyberia-game-ticket.service.js';
import { commitState } from '../../../src/projects/cyberia/player/player-state.js';
import {
  acquireSession,
  checkpointSessions,
  consumeLaunch,
  issueResume,
  releaseSession,
} from '../../../src/projects/cyberia/player/player-session.js';
import { GuestService } from '../../../src/api/user/guest.service.js';
import { listFriends, updateFriendship } from '../../../src/projects/cyberia/player/friendship.js';
import {
  DEFAULT_INSTANCE_CODE,
  FRIEND_REQUESTS_MAX,
} from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import {
  heldReport,
  pruneQuestProgress,
  rebindHeld,
  restoreQuestProgress,
} from '../../../src/projects/cyberia/player/player-maintenance.js';
import { buildPlayerHandlers, cyberiaProto } from '../../../src/grpc/cyberia/grpc-server.js';
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
  'cyberia-player',
  'cyberia-game-session',
  'cyberia-game-ticket',
  'cyberia-friendship',
  'cyberia-quest-progress',
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
/** A launch from the portal to a game server of world w1: the ticket, consumed by a new connection. */
const launch = async (who, instanceCode = 'w1') => {
  const { ticket } = await createGameTicket({ ...who, instanceCode }, CONTEXT);
  const connectionId = `conn-${++connections}`;
  return { ticket, connectionId, consumed: await consumeLaunch({ ticket, instanceCode, connectionId }, CONTEXT) };
};

const play = async (who) => {
  const { connectionId } = await launch(who);
  return {
    connectionId,
    ...(await acquireSession({ connectionId, instanceCode: 'w1', serverId: 'server-a' }, CONTEXT)),
  };
};

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
    for (const name of ['CyberiaPlayer', 'CyberiaGameTicket', 'CyberiaFriendship', 'CyberiaQuestProgress', 'User'])
      await model(name).syncIndexes();
    await model('CyberiaInstance').create([{ code: 'w1' }, { code: 'w2' }, { code: DEFAULT_INSTANCE_CODE }]);
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
      expect(player.position).toMatchObject({ mapCode: 'm1', x: 5, y: 6 });
      expect(player.coins).toBe(50);
      expect(player.positionSeq).toBe(5);
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
  });

  describe('maintenance', () => {
    it('archives the quest progress no profile owns, and restores it once its profile returns', async () => {
      const models = { QuestProgress: model('CyberiaQuestProgress'), Player: model('CyberiaPlayer') };
      const session = await play(await account());
      const missing = new mongoose.Types.ObjectId();
      await models.QuestProgress.collection.insertOne({ questCode: 'q1', status: 'active' });
      await models.QuestProgress.create({ player: missing, questCode: 'q1' });
      const owned = await models.QuestProgress.create({ player: session.playerId, questCode: 'q1' });
      const before = await models.QuestProgress.countDocuments({});

      expect(await pruneQuestProgress(models)).toMatchObject({ legacy: 1, orphaned: 1, archived: 0, applied: false });
      expect(await models.QuestProgress.countDocuments({})).toBe(before);

      await models.QuestProgress.collection.createIndex({ questCode: 1 }, { name: 'operator_questCode' });
      await expect(pruneQuestProgress(models, { apply: true })).rejects.toThrow('operator_questCode');
      expect(await models.QuestProgress.countDocuments({})).toBe(before);
      await models.QuestProgress.collection.dropIndex('operator_questCode');

      expect(await pruneQuestProgress(models, { apply: true })).toMatchObject({ archived: 2, applied: true });
      expect(await pruneQuestProgress(models, { apply: true })).toMatchObject({ archived: 0, applied: true });
      expect(await models.QuestProgress.countDocuments({})).toBe(before - 2);
      expect(await models.QuestProgress.exists({ _id: owned._id })).toBeTruthy();
      expect((await pruneQuestProgress(models)).indexes).toEqual({ toDrop: [], toCreate: [] });

      expect(await restoreQuestProgress(models)).toMatchObject({ restorable: 0, kept: 2 });
      await models.Player.collection.insertOne({
        _id: missing,
        user: new mongoose.Types.ObjectId(),
        instanceCode: 'w1',
      });
      expect(await restoreQuestProgress(models, { apply: true })).toMatchObject({
        restored: 1,
        kept: 1,
        applied: true,
      });
      expect(await models.QuestProgress.exists({ player: missing, questCode: 'q1' })).toBeTruthy();
    });

    it('reports held stacks and rebinds them only for profiles out of a session', async () => {
      const offline = await account();
      const online = await account();
      const held = [{ stack: stack('lamp', 0, 2, 'cid-lamp-v1'), container: 'bag', actionCode: '', reason: 'rebound' }];
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
      expect(await heldReport(model('CyberiaPlayer'), { instanceCode: 'w1' })).toContainEqual(
        expect.objectContaining({
          itemId: 'lamp',
          olCid: 'cid-lamp-v1',
          reason: 'rebound',
          stacks: 2,
          units: 4,
          profiles: 2,
        }),
      );
      const models = { Player: model('CyberiaPlayer'), GameSession: model('CyberiaGameSession') };
      expect(await rebindHeld(models, { itemId: 'lamp', olCid: 'cid-lamp-v2' })).toEqual({
        profiles: 1,
        stacks: 1,
        live: 1,
        applied: false,
      });
      expect(await rebindHeld(models, { itemId: 'lamp', olCid: 'cid-lamp-v2', apply: true })).toMatchObject({
        profiles: 1,
        live: 1,
      });
      const after = await model('CyberiaPlayer').find({ 'held.stack.itemId': 'lamp' }, { user: 1, held: 1 }).lean();
      const cidOf = (who) => after.find((p) => String(p.user) === who.user).held[0].stack.olCid;
      expect([cidOf(offline), cidOf(online)]).toEqual(['cid-lamp-v2', 'cid-lamp-v1']);
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
  });
});
