/**
 * Gameplay sessions: the launch, the lease that makes one connection the writer of a profile, the
 * checkpoints that renew it, and the release.
 *
 * One account holds one gameplay session, in any world. The profile belongs to the universe of the
 * world, and the lease names the world the session plays. Each acquisition raises the epoch of the
 * profile, so a write of an older session is refused in every world of the universe.
 *
 * A newer connection of the account waits while the session it replaces may still write on another
 * server: a resume waits (`busy`), and an acquisition waits while that session closes (`saving`).
 * The server of a session in `recovery` cannot save it, so a newer session fences it at once. On
 * the same server the newer session adopts what the older one has not saved, so it never waits.
 *
 * @module src/projects/cyberia/player/player-session.js
 * @namespace CyberiaPlayerSession
 */
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  consumeGameTicket,
  createGameTicket,
  createResumeTicket,
  findGameTicket,
  ticketOfConnection,
} from '../../../api/cyberia-game-ticket/cyberia-game-ticket.service.js';
import { PLAYER_SCHEMA_VERSION } from '../../../api/cyberia-player/cyberia-player.model.js';
import { SESSION_DURABILITY, SESSION_FAILURES } from '../../../api/cyberia-game-session/cyberia-game-session.model.js';
import { routeLeads, universeCodeOf } from '../../../api/cyberia-universe/cyberia-universe.service.js';
import { GuestService } from '../../../api/user/guest.service.js';
import { loadState, writePositions } from './player-state.js';
import { loggerFactory } from '../../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * Seconds a lease lives after its last checkpoint: `CYBERIA_GAME_SESSION_LEASE_SECONDS`, default
 * 60, at least 15. The game server checkpoints every third of it.
 * @returns {number}
 * @memberof CyberiaPlayerSession
 */
const leaseSeconds = () => Math.max(15, Number(process.env.CYBERIA_GAME_SESSION_LEASE_SECONDS) || 60);

const leaseEnd = (now) => new Date(now.getTime() + leaseSeconds() * 1000);

const model = (name, context) => DataBaseProviderService.getModel(name, context);

/** The account a ticket names while the account session that asked for it still exists. */
const liveAccount = async (ticket, context) =>
  await model('User', context)
    .findOne({ _id: ticket.user, 'activeSessions._id': ticket.session, role: { $ne: 'guest' } })
    .select('username')
    .lean();

/**
 * Whether a lease names a session on another server that may still write: it lives, and its server
 * has not reported that the engine refuses its state.
 * @param {Object|null} lease - Lean `CyberiaGameSession`.
 * @param {string} serverId - The server of the newer connection.
 * @param {Date} now
 * @returns {boolean}
 */
const writesElsewhere = (lease, serverId, now) =>
  !!lease && lease.serverId !== serverId && lease.expiresAt > now && lease.health?.durability !== 'recovery';

/**
 * Whether a resume ticket must wait: the session it continues may still write on another server,
 * so its final commit may not have landed. The ticket stays unconsumed for a later try.
 */
const resumeWaits = async (ticket, serverId, context) => {
  const pending = await findGameTicket(ticket, context);
  if (typeof pending?.epoch !== 'number' || pending.consumedAt) return false;
  const lease = await model('CyberiaGameSession', context)
    .findOne({ user: pending.user }, { serverId: 1, expiresAt: 1, 'health.durability': 1 })
    .lean();
  return writesElsewhere(lease, serverId, new Date());
};

/**
 * Consumes a launch ticket and names its principal: an account with its name, or a guest, which
 * the game server names and never persists. A resume ticket waits (`busy`) while the session it
 * continues may still write on another server.
 * @param {{ticket: string, instanceCode: string, connectionId: string, serverId: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{refusal: string, principal?: string, accountId?: string, displayName?: string}>}
 * @memberof CyberiaPlayerSession
 */
const consumeLaunch = async ({ ticket, instanceCode, connectionId, serverId }, context) => {
  if (await resumeWaits(ticket, serverId, context)) return { refusal: 'busy' };
  const consumed = await consumeGameTicket({ ticket, instanceCode, connection: connectionId }, context);
  if (consumed.refusal) return { refusal: consumed.refusal };
  if (consumed.principal === 'guest')
    return (await GuestService.find(consumed.guest, context))
      ? { refusal: '', principal: 'guest' }
      : { refusal: 'revoked' };
  const account = await liveAccount(consumed, context);
  if (!account) return { refusal: 'revoked' };
  const resumed = typeof consumed.epoch === 'number';
  if (
    resumed &&
    !(await model('CyberiaPlayer', context).exists({
      user: consumed.user,
      universeCode: await universeCodeOf(instanceCode, context),
      epoch: consumed.epoch,
    }))
  )
    return { refusal: 'signed_in_elsewhere' };
  return { refusal: '', principal: 'account', accountId: String(account._id), displayName: account.username };
};

/**
 * The lease of a live account session: the one this server holds for the profile, at its epoch, in
 * its world, with its portal session live. A session a newer launch took over, or whose portal
 * session ended, gets a refusal instead.
 * @param {{playerId: string, accountId: string, epoch: number, instanceCode: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{refusal: string, lease?: Object}>} `refusal` also names `ended` for a session an
 *   operator ended.
 */
const liveLease = async ({ playerId, accountId, epoch, instanceCode }, context) => {
  if (!mongoose.isValidObjectId(accountId) || !mongoose.isValidObjectId(playerId)) return { refusal: 'revoked' };
  const lease = await model('CyberiaGameSession', context).findOne({ user: accountId }).lean();
  if (
    !lease ||
    String(lease.player) !== playerId ||
    lease.epoch !== Number(epoch) ||
    lease.instanceCode !== instanceCode
  )
    return { refusal: 'signed_in_elsewhere' };
  if (lease.endedBy) return { refusal: 'ended' };
  if (!(await liveAccount({ user: accountId, session: lease.accountSession }, context))) return { refusal: 'revoked' };
  return { refusal: '', lease };
};

/**
 * Issues the next resume ticket of a live account session.
 * @param {{playerId: string, accountId: string, epoch: number, instanceCode: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{refusal: string, ticket?: string, expiresAtMs?: number}>}
 * @memberof CyberiaPlayerSession
 */
const issueResume = async (request, context) => {
  const { refusal, lease } = await liveLease(request, context);
  if (refusal) return { refusal };
  const { ticket, expiresAt } = await createResumeTicket(
    { user: lease.user, session: lease.accountSession, instanceCode: lease.instanceCode, epoch: lease.epoch },
    context,
  );
  return { refusal: '', ticket, expiresAtMs: expiresAt.getTime() };
};

/**
 * Issues the ticket of a travel of a live account session: a launch ticket of its portal session
 * for another world of its universe that a route reaches and a server takes. The session saves and
 * leaves next, and the target world acquires the profile with a new epoch.
 * @param {{playerId: string, accountId: string, epoch: number, instanceCode: string, targetCode: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{refusal: string, ticket?: string, expiresAtMs?: number}>} `refusal` also names
 *   `no_route`, and `unavailable` for a world the engine does not launch now.
 * @memberof CyberiaPlayerSession
 */
const issueTravel = async ({ targetCode, ...request }, context) => {
  const { refusal, lease } = await liveLease(request, context);
  if (refusal) return { refusal };
  if (!(await routeLeads(lease.instanceCode, targetCode, context))) return { refusal: 'no_route' };
  try {
    const { ticket, expiresAt } = await createGameTicket(
      { principal: 'account', user: lease.user, session: lease.accountSession, instanceCode: targetCode },
      context,
    );
    return { refusal: '', ticket, expiresAtMs: expiresAt.getTime() };
  } catch (error) {
    if (!error.status) throw error;
    logger.info(`Travel of ${request.playerId} to ${targetCode} refused: ${error.message}`);
    return { refusal: 'unavailable' };
  }
};

/**
 * Makes the connection of a consumed ticket the writer of its profile in the universe of the
 * ticket's world, and loads the saved state of that world. A retry of the same connection keeps the
 * epoch it got. A world outside every universe has no profile to play. While the session the
 * account left closes on another server and may still save, the acquisition answers `saving`.
 * @param {{connectionId: string, instanceCode: string, serverId: string}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{refusal: string, playerId?: string, epoch?: number, state?: Object, created?: boolean, leaseSeconds?: number}>}
 * @memberof CyberiaPlayerSession
 */
const acquireSession = async ({ connectionId, instanceCode, serverId }, context) => {
  const ticket = await ticketOfConnection(connectionId, context);
  if (!ticket || ticket.instanceCode !== instanceCode || ticket.principal !== 'account') return { refusal: 'unknown' };
  if (!(await liveAccount(ticket, context))) return { refusal: 'revoked' };
  const universeCode = await universeCodeOf(instanceCode, context);
  if (!universeCode) {
    logger.error(`World ${instanceCode} belongs to no universe: an account cannot play it`);
    return { refusal: 'unavailable' };
  }

  const Player = model('CyberiaPlayer', context);
  const GameSession = model('CyberiaGameSession', context);
  const session = await Player.db.startSession();
  try {
    let player;
    let saving = false;
    await session.withTransaction(async () => {
      const now = new Date();
      const current = await GameSession.findOne({ user: ticket.user }, null, { session }).lean();
      if (current?.connection === connectionId && !current.endedBy) {
        player = await Player.findById(current.player, null, { session }).lean();
        return;
      }
      saving = writesElsewhere(current, serverId, now) && !!current.health?.closing;
      if (saving) return;
      if (current?.health?.durability === 'recovery' && current.expiresAt > now)
        logger.warn(
          `Session of account ${ticket.user} on ${current.serverId} cannot save seq ${current.health.seq}: the new session fences it`,
        );
      const profile = await Player.findOneAndUpdate(
        { user: ticket.user, universeCode },
        {
          $inc: { epoch: 1 },
          $set: { commitSeq: 0, lastPlayedAt: now },
          $setOnInsert: { schemaVersion: PLAYER_SCHEMA_VERSION },
        },
        { upsert: true, returnDocument: 'after', session },
      ).lean();
      await Player.updateOne(
        { _id: profile._id, 'worlds.instanceCode': { $ne: instanceCode } },
        { $push: { worlds: { instanceCode } } },
        { session },
      );
      player = await Player.findOneAndUpdate(
        { _id: profile._id },
        { $set: { 'worlds.$[world].positionSeq': 0 } },
        { arrayFilters: [{ 'world.instanceCode': instanceCode }], returnDocument: 'after', session },
      ).lean();
      await GameSession.updateOne(
        { user: ticket.user },
        {
          $set: {
            player: player._id,
            instanceCode,
            serverId,
            connection: connectionId,
            epoch: player.epoch,
            accountSession: ticket.session,
            mapCode: '',
            startedAt: now,
            expiresAt: leaseEnd(now),
            health: { at: null },
            endedBy: null,
          },
        },
        { upsert: true, session },
      );
    });
    if (saving) return { refusal: 'saving' };
    return {
      refusal: '',
      playerId: String(player._id),
      epoch: player.epoch,
      state: await loadState(player, instanceCode, context),
      created: player.revision === 0,
      leaseSeconds: leaseSeconds(),
    };
  } finally {
    await session.endSession();
  }
};

/** The health a checkpoint reports for a session, bounded to the vocabulary of the lease. */
const healthOf = (health, now) => ({
  durability: SESSION_DURABILITY.includes(health?.durability) ? health.durability : 'saved',
  closing: !!health?.closing,
  seq: Number(health?.seq) || 0,
  durableSeq: Number(health?.durableSeq) || 0,
  unsavedMs: Number(health?.unsavedMs) || 0,
  failure: SESSION_FAILURES.includes(health?.failure) ? health.failure : '',
  at: now,
});

/**
 * Renews the leases of one server, stores the health each one reports and writes their dirty
 * positions. A session whose lease another connection took, whose account session ended, or that
 * an operator ended comes back in `ended`.
 * @param {{sessions: {playerId: string, accountId: string, epoch: number, mapCode: string, position?: Object, health?: Object}[]}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{ended: {playerId: string, reason: string}[]}>}
 * @memberof CyberiaPlayerSession
 */
const checkpointSessions = async ({ sessions = [] }, context) => {
  const entries = sessions.filter(
    (s) => mongoose.isValidObjectId(s.playerId) && mongoose.isValidObjectId(s.accountId) && s.epoch > 0,
  );
  const users = entries.map((s) => s.accountId);
  const [leases, accounts] = await Promise.all([
    model('CyberiaGameSession', context)
      .find({ user: { $in: users } })
      .lean(),
    model('User', context)
      .find({ _id: { $in: users } }, { 'activeSessions._id': 1 })
      .lean(),
  ]);
  const leaseOf = new Map(leases.map((lease) => [String(lease.user), lease]));
  const accountSessionsOf = new Map(
    accounts.map((a) => [String(a._id), new Set((a.activeSessions ?? []).map((s) => String(s._id)))]),
  );

  const now = new Date();
  const ended = [];
  const renewals = [];
  const positions = [];
  for (const entry of entries) {
    const lease = leaseOf.get(entry.accountId);
    if (!lease || String(lease.player) !== entry.playerId || lease.epoch !== entry.epoch) {
      ended.push({ playerId: entry.playerId, reason: 'signed_in_elsewhere' });
      continue;
    }
    if (lease.endedBy) {
      ended.push({ playerId: entry.playerId, reason: 'ended' });
      continue;
    }
    if (!accountSessionsOf.get(entry.accountId)?.has(String(lease.accountSession))) {
      ended.push({ playerId: entry.playerId, reason: 'revoked' });
      continue;
    }
    renewals.push({
      updateOne: {
        filter: { _id: lease._id, player: lease.player, epoch: lease.epoch, endedBy: null },
        update: {
          $set: { expiresAt: leaseEnd(now), mapCode: String(entry.mapCode ?? ''), health: healthOf(entry.health, now) },
        },
      },
    });
    if (entry.position?.mapCode) positions.push({ ...entry, instanceCode: lease.instanceCode });
  }
  if (renewals.length > 0) await model('CyberiaGameSession', context).bulkWrite(renewals, { ordered: false });
  await writePositions(positions, context);
  return { ended };
};

/**
 * Ends the lease of a session after its final commit. A lease another session took stays.
 * @param {{playerId: string, accountId: string, epoch: number}} request
 * @param {{host: string, path: string}|string} context
 * @memberof CyberiaPlayerSession
 */
const releaseSession = async ({ playerId, accountId, epoch }, context) => {
  if (!mongoose.isValidObjectId(playerId) || !mongoose.isValidObjectId(accountId)) return;
  await model('CyberiaGameSession', context).deleteOne({ user: accountId, player: playerId, epoch });
};

/**
 * The live presence of accounts: world and map of each one online.
 * @param {*[]} users - Account ids.
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<Map<string, {instanceCode: string, mapCode: string}>>}
 * @memberof CyberiaPlayerSession
 */
const presenceOf = async (users, context) => {
  const leases = await model('CyberiaGameSession', context)
    .find({ user: { $in: users }, expiresAt: { $gt: new Date() } }, { user: 1, instanceCode: 1, mapCode: 1 })
    .lean();
  return new Map(leases.map((l) => [String(l.user), { instanceCode: l.instanceCode, mapCode: l.mapCode }]));
};

export {
  acquireSession,
  checkpointSessions,
  consumeLaunch,
  issueResume,
  issueTravel,
  leaseSeconds,
  presenceOf,
  releaseSession,
};
