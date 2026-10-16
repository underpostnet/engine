/**
 * Gameplay sessions: the launch, the lease that makes one connection the writer of a profile, the
 * checkpoints that renew it, and the release.
 *
 * One account holds one gameplay session. Each acquisition raises the epoch of the profile, so a
 * write of an older session is refused.
 *
 * @module src/projects/cyberia/player/player-session.js
 * @namespace CyberiaPlayerSession
 */
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  consumeGameTicket,
  createResumeTicket,
  findGameTicket,
  ticketOfConnection,
} from '../../../api/cyberia-game-ticket/cyberia-game-ticket.service.js';
import { PLAYER_SCHEMA_VERSION } from '../../../api/cyberia-player/cyberia-player.model.js';
import { GuestService } from '../../../api/user/guest.service.js';
import { loadState, writePositions } from './player-state.js';

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
 * Whether a resume ticket must wait: the session it continues still holds its lease, so its final
 * commit may not have landed. The ticket stays unconsumed for a later try.
 */
const resumeWaits = async (ticket, connectionId, context) => {
  const pending = await findGameTicket(ticket, context);
  return (
    typeof pending?.epoch === 'number' &&
    !pending.consumedAt &&
    !!(await model('CyberiaGameSession', context).exists({ user: pending.user, expiresAt: { $gt: new Date() } }))
  );
};

/**
 * Consumes a launch ticket and names its principal: an account with its name, or a guest, which
 * the game server names and never persists. A resume ticket waits (`busy`) while the session it
 * continues still holds its lease.
 * @param {{ticket: string, instanceCode: string, connectionId: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{refusal: string, principal?: string, accountId?: string, displayName?: string}>}
 * @memberof CyberiaPlayerSession
 */
const consumeLaunch = async ({ ticket, instanceCode, connectionId }, context) => {
  if (await resumeWaits(ticket, connectionId, context)) return { refusal: 'busy' };
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
    !(await model('CyberiaPlayer', context).exists({ user: consumed.user, instanceCode, epoch: consumed.epoch }))
  )
    return { refusal: 'signed_in_elsewhere' };
  return { refusal: '', principal: 'account', accountId: String(account._id), displayName: account.username };
};

/**
 * Issues the next resume ticket of a live account session. A session a newer launch took over, or
 * whose portal session ended, gets a refusal instead.
 * @param {{playerId: string, accountId: string, epoch: number, instanceCode: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{refusal: string, ticket?: string, expiresAtMs?: number}>}
 * @memberof CyberiaPlayerSession
 */
const issueResume = async ({ playerId, accountId, epoch, instanceCode }, context) => {
  if (!mongoose.isValidObjectId(accountId) || !mongoose.isValidObjectId(playerId)) return { refusal: 'revoked' };
  const lease = await model('CyberiaGameSession', context).findOne({ user: accountId }).lean();
  if (
    !lease ||
    String(lease.player) !== playerId ||
    lease.epoch !== Number(epoch) ||
    lease.instanceCode !== instanceCode
  )
    return { refusal: 'signed_in_elsewhere' };
  if (!(await liveAccount({ user: accountId, session: lease.accountSession }, context))) return { refusal: 'revoked' };
  const { ticket, expiresAt } = await createResumeTicket(
    { user: accountId, session: lease.accountSession, instanceCode, epoch: lease.epoch },
    context,
  );
  return { refusal: '', ticket, expiresAtMs: expiresAt.getTime() };
};

/**
 * Makes the connection of a consumed ticket the writer of its profile in the ticket's world, and
 * loads the saved state. A retry of the same connection keeps the epoch it got.
 * @param {{connectionId: string, instanceCode: string, serverId: string}} request
 * @param {{host: string, path: string}|string} context
 * @memberof CyberiaPlayerSession
 */
const acquireSession = async ({ connectionId, instanceCode, serverId }, context) => {
  const ticket = await ticketOfConnection(connectionId, context);
  if (!ticket || ticket.instanceCode !== instanceCode || ticket.principal !== 'account') return { refusal: 'unknown' };
  if (!(await liveAccount(ticket, context))) return { refusal: 'revoked' };

  const Player = model('CyberiaPlayer', context);
  const GameSession = model('CyberiaGameSession', context);
  const session = await Player.db.startSession();
  try {
    let player;
    await session.withTransaction(async () => {
      const now = new Date();
      const current = await GameSession.findOne({ user: ticket.user }, null, { session }).lean();
      if (current?.connection === connectionId) {
        player = await Player.findById(current.player, null, { session }).lean();
        return;
      }
      player = await Player.findOneAndUpdate(
        { user: ticket.user, instanceCode },
        {
          $inc: { epoch: 1 },
          $set: { commitSeq: 0, positionSeq: 0, lastPlayedAt: now },
          $setOnInsert: { schemaVersion: PLAYER_SCHEMA_VERSION },
        },
        { upsert: true, returnDocument: 'after', session },
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
          },
        },
        { upsert: true, session },
      );
    });
    return {
      refusal: '',
      playerId: String(player._id),
      epoch: player.epoch,
      state: await loadState(player, context),
      created: player.revision === 0,
      leaseSeconds: leaseSeconds(),
    };
  } finally {
    await session.endSession();
  }
};

/**
 * Renews the leases of one server and writes their dirty positions. A session whose lease another
 * connection took, or whose account session ended, comes back in `ended`.
 * @param {{sessions: {playerId: string, accountId: string, epoch: number, mapCode: string, position?: Object}[]}} request
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
    if (!accountSessionsOf.get(entry.accountId)?.has(String(lease.accountSession))) {
      ended.push({ playerId: entry.playerId, reason: 'revoked' });
      continue;
    }
    renewals.push({
      updateOne: {
        filter: { _id: lease._id, player: lease.player, epoch: lease.epoch },
        update: { $set: { expiresAt: leaseEnd(now), mapCode: String(entry.mapCode ?? '') } },
      },
    });
    if (entry.position?.mapCode) positions.push(entry);
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

export { acquireSession, checkpointSessions, consumeLaunch, issueResume, leaseSeconds, presenceOf, releaseSession };
