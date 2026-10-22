/**
 * The operator view of player profiles and their live sessions: pages of profiles with the lease
 * and the health its server reports, the detail of one profile, its audit trail, and the one
 * privileged action, ending a session.
 *
 * A profile is the persistent state of an account in one universe; a session is the lease a game
 * server holds to write it. The view returns counts of the goods of a profile, never the goods,
 * and no secret or contact of an account.
 *
 * @module src/projects/cyberia/player/player-admin.js
 * @namespace CyberiaPlayerAdmin
 */
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { PLAYER_SCHEMA_VERSION } from '../../../api/cyberia-player/cyberia-player.model.js';
import { runTransaction } from './transaction.js';

/** Rows of one page of profiles, by default and at most. */
const PAGE = Object.freeze({ default: 25, max: 50 });

/** Accounts a name search reads, at most. */
const SEARCH_ACCOUNTS = 200;

/** Records of one page of an audit trail. */
const AUDIT_PAGE = 20;

/** Length bounds of the reason an operator gives. */
const REASON = Object.freeze({ min: 3, max: 200 });

/**
 * What an operator sees of a profile at a glance: `online` while a live lease plays it, `closing`
 * while its server saves the final state, else `offline`.
 */
const PLAYER_STATUSES = Object.freeze(['online', 'closing', 'offline']);

const failure = (status, message) => Object.assign(new Error(message), { status });
const model = (name, context) => DataBaseProviderService.getModel(name, context);
const isId = (value) => typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The cursor of the page after a row of a newest-first page: its time, then its id. */
const cursorOf = (time, id) => `${time ? time.getTime() : 0}_${id}`;

/** The filter of the rows after a cursor of a newest-first page over `field`, then `_id`. */
const afterFilter = (field, after) => {
  const [ms, id] = String(after || '').split('_');
  if (!/^\d+$/.test(ms ?? '') || !isId(id)) return {};
  const at = new Date(Number(ms));
  return { $or: [{ [field]: { $lt: at } }, { [field]: at, _id: { $lt: new mongoose.Types.ObjectId(id) } }] };
};

/** The session a lease names for a profile, as an operator sees it, or null when none plays it. */
const sessionOf = (lease, profile, now) => {
  if (!lease || String(lease.player) !== String(profile._id) || lease.epoch !== profile.epoch) return null;
  return {
    instanceCode: lease.instanceCode,
    serverId: lease.serverId,
    mapCode: lease.mapCode,
    epoch: lease.epoch,
    startedAt: lease.startedAt,
    expiresAt: lease.expiresAt,
    live: lease.expiresAt > now && !lease.endedBy,
    ended: !!lease.endedBy,
    health: lease.health?.at
      ? {
          durability: lease.health.durability,
          closing: lease.health.closing,
          seq: lease.health.seq,
          durableSeq: lease.health.durableSeq,
          unsavedMs: lease.health.unsavedMs,
          failure: lease.health.failure,
          at: lease.health.at,
        }
      : null,
  };
};

const statusOf = (session) => {
  if (!session?.live) return 'offline';
  return session.health?.closing ? 'closing' : 'online';
};

/** One row of the page of profiles. */
const rowOf = (profile, account, lease, now) => {
  const session = sessionOf(lease, profile, now);
  return {
    id: String(profile._id),
    accountId: String(profile.user),
    username: account?.username ?? '',
    universeCode: profile.universeCode,
    lastPlayedAt: profile.lastPlayedAt,
    epoch: profile.epoch,
    commitSeq: profile.commitSeq,
    revision: profile.revision,
    schemaVersion: profile.schemaVersion,
    coins: profile.coins,
    xp: profile.xp,
    status: statusOf(session),
    session,
  };
};

/** The accounts a search names: an account id, or the accounts whose name starts with the text. */
const searchedAccounts = async (q, context) => {
  const text = String(q ?? '').trim();
  if (!text) return null;
  if (isId(text)) return [new mongoose.Types.ObjectId(text)];
  const accounts = await model('User', context)
    .find({ username: { $regex: `^${escapeRegExp(text)}`, $options: 'i' }, role: { $ne: 'guest' } }, { _id: 1 })
    .limit(SEARCH_ACCOUNTS)
    .lean();
  return accounts.map(({ _id }) => _id);
};

/**
 * One page of profiles, the last played first: each with its account name and the session its
 * lease names. Three bounded reads per page: the profiles, their accounts and their leases.
 * @param {{q?: string, universeCode?: string, status?: string, after?: string, limit?: number|string}} query -
 *   `q` is an account id or the start of an account name; `status` keeps the profiles in one of
 *   {@link PLAYER_STATUSES} but `offline`.
 * @param {{host: string, path: string}} context
 * @returns {Promise<{data: Object[], next: string}>}
 * @memberof CyberiaPlayerAdmin
 */
const listPlayers = async ({ q, universeCode, status, after, limit } = {}, context) => {
  const now = new Date();
  const size = Math.min(PAGE.max, Math.max(1, Number.parseInt(limit, 10) || PAGE.default));
  const filter = { ...afterFilter('lastPlayedAt', after) };
  const accounts = await searchedAccounts(q, context);
  if (accounts) filter.user = { $in: accounts };
  if (typeof universeCode === 'string' && universeCode) filter.universeCode = universeCode;
  if (status === 'online' || status === 'closing') {
    const leases = await model('CyberiaGameSession', context)
      .find(
        { expiresAt: { $gt: now }, endedBy: null, 'health.closing': status === 'closing' ? true : { $ne: true } },
        { player: 1 },
      )
      .lean();
    filter._id = { $in: leases.map(({ player }) => player) };
  }
  const profiles = await model('CyberiaPlayer', context)
    .find(filter, {
      user: 1,
      universeCode: 1,
      lastPlayedAt: 1,
      epoch: 1,
      commitSeq: 1,
      revision: 1,
      schemaVersion: 1,
      coins: 1,
      xp: 1,
    })
    .sort({ lastPlayedAt: -1, _id: -1 })
    .limit(size + 1)
    .lean();
  const page = profiles.slice(0, size);
  const users = page.map(({ user }) => user);
  const [names, leases] = await Promise.all([
    model('User', context)
      .find({ _id: { $in: users } }, { username: 1 })
      .lean(),
    model('CyberiaGameSession', context)
      .find({ user: { $in: users } })
      .lean(),
  ]);
  const nameOf = new Map(names.map((account) => [String(account._id), account]));
  const leaseOf = new Map(leases.map((lease) => [String(lease.user), lease]));
  const last = page.at(-1);
  return {
    data: page.map((profile) =>
      rowOf(profile, nameOf.get(String(profile.user)), leaseOf.get(String(profile.user)), now),
    ),
    next: profiles.length > size ? cursorOf(last.lastPlayedAt, last._id) : '',
  };
};

/**
 * The detail of one profile: its row, the counts of what it keeps in its universe and in each
 * world, its quests by world, and whether its shape is current.
 * @param {string} id - Profile id.
 * @param {{host: string, path: string}} context
 * @returns {Promise<Object>}
 * @memberof CyberiaPlayerAdmin
 */
const playerDetail = async (id, context) => {
  if (!isId(id)) throw failure(400, 'A profile id is 24 hexadecimal characters');
  const profile = await model('CyberiaPlayer', context).findById(id).lean();
  if (!profile) throw failure(404, 'No such profile');
  const now = new Date();
  const [account, lease, quests] = await Promise.all([
    model('User', context).findById(profile.user, { username: 1 }).lean(),
    model('CyberiaGameSession', context).findOne({ user: profile.user }).lean(),
    model('CyberiaQuestProgress', context).aggregate([
      { $match: { player: profile._id } },
      { $group: { _id: { instanceCode: '$instanceCode', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ]);
  const questsOf = (instanceCode, status) =>
    quests.find(({ _id }) => _id.instanceCode === instanceCode && _id.status === status)?.count ?? 0;
  return {
    ...rowOf(profile, account, lease, now),
    schemaCurrent: profile.schemaVersion === PLAYER_SCHEMA_VERSION,
    createdAt: profile.createdAt,
    carried: { bag: profile.bag.length, storage: profile.storage.length, held: profile.held.length },
    worlds: profile.worlds.map((world) => ({
      instanceCode: world.instanceCode,
      mapCode: world.position?.mapCode ?? '',
      positionAt: world.position?.at ?? null,
      vaults: world.vaults.length,
      held: world.held.length,
      quests: { active: questsOf(world.instanceCode, 'active'), completed: questsOf(world.instanceCode, 'completed') },
    })),
  };
};

/**
 * One page of the audit trail of a profile, newest first.
 * @param {{player: string, after?: string}} query
 * @param {{host: string, path: string}} context
 * @returns {Promise<{data: Object[], next: string}>}
 * @memberof CyberiaPlayerAdmin
 */
const playerAudit = async ({ player, after }, context) => {
  if (!isId(player)) throw failure(400, 'A profile id is 24 hexadecimal characters');
  const records = await model('CyberiaPlayerAudit', context)
    .find({ player, ...afterFilter('createdAt', after) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(AUDIT_PAGE + 1)
    .populate('actor', 'username')
    .lean();
  const page = records.slice(0, AUDIT_PAGE);
  const last = page.at(-1);
  return {
    data: page.map(({ _id, actor, ...record }) => ({
      ...record,
      id: String(_id),
      actor: actor?.username ?? '',
    })),
    next: records.length > AUDIT_PAGE ? cursorOf(last.createdAt, last._id) : '',
  };
};

/** The first defect of an end request, or ''. */
const endDefect = ({ operationId, reason, epoch }) => {
  if (typeof operationId !== 'string' || !/^[\w-]{8,64}$/.test(operationId))
    return 'An operation id is 8 to 64 word characters';
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < REASON.min || text.length > REASON.max)
    return `A reason is ${REASON.min} to ${REASON.max} characters`;
  if (!Number.isSafeInteger(epoch) || epoch < 0) return 'The epoch is the one the operator saw';
  return '';
};

/**
 * Ends the live session of a profile for an operator. It raises the epoch of the profile, so the
 * server of the session can no longer write it, and marks the lease ended, so that server ends the
 * session at its next checkpoint. The changes the session has not saved are discarded: the view
 * shows them before the operator confirms. Refused unless the profile still has the epoch the
 * operator saw and a lease of it plays. Every request is an audit record; a retry of the same
 * operation id answers the recorded outcome.
 * @param {{playerId: string, operationId: string, reason: string, epoch: number, actor: string}} request
 * @param {{host: string, path: string}} context
 * @returns {Promise<{operationId: string, outcome: string, refusal: string, epoch: number|null}>} `refusal`
 *   is empty, or `changed` (the profile has another epoch now) | `no_session`.
 * @memberof CyberiaPlayerAdmin
 */
const endSession = async ({ playerId, operationId, reason, epoch, actor }, context) => {
  if (!isId(playerId)) throw failure(400, 'A profile id is 24 hexadecimal characters');
  const defect = endDefect({ operationId, reason, epoch });
  if (defect) throw failure(400, defect);
  const Player = model('CyberiaPlayer', context);
  const GameSession = model('CyberiaGameSession', context);
  const Audit = model('CyberiaPlayerAudit', context);
  const answer = ({ outcome, refusal, epochAfter }) => ({ operationId, outcome, refusal, epoch: epochAfter });
  return await runTransaction(Player, async (session) => {
    const recorded = await Audit.findOne({ operationId }, null, { session }).lean();
    if (recorded) {
      if (String(recorded.player) !== playerId || String(recorded.actor) !== String(actor))
        throw failure(409, 'The operation id names another request');
      return answer(recorded);
    }
    const profile = await Player.findById(playerId, { user: 1, epoch: 1 }, { session }).lean();
    if (!profile) throw failure(404, 'No such profile');
    const lease = await GameSession.findOne({ user: profile.user }, null, { session }).lean();
    const now = new Date();
    const live = sessionOf(lease, profile, now)?.live ?? false;
    const refusal = profile.epoch !== epoch ? 'changed' : live ? '' : 'no_session';
    const epochAfter = refusal ? profile.epoch : profile.epoch + 1;
    if (!refusal) {
      await Player.updateOne({ _id: profile._id, epoch: profile.epoch }, { $inc: { epoch: 1 } }, { session });
      await GameSession.updateOne(
        { _id: lease._id, epoch: lease.epoch },
        { $set: { endedBy: actor, expiresAt: now } },
        { session },
      );
    }
    const record = {
      operationId,
      action: 'session.end',
      actor,
      player: profile._id,
      reason: reason.trim(),
      outcome: refusal ? 'refused' : 'done',
      refusal,
      epochBefore: profile.epoch,
      epochAfter,
      session: lease
        ? {
            instanceCode: lease.instanceCode,
            serverId: lease.serverId,
            durability: lease.health?.durability ?? '',
            seq: lease.health?.seq ?? 0,
            durableSeq: lease.health?.durableSeq ?? 0,
            unsavedMs: lease.health?.unsavedMs ?? 0,
          }
        : null,
    };
    await Audit.create([record], { session });
    return answer(record);
  });
};

export { PLAYER_STATUSES, endSession, listPlayers, playerAudit, playerDetail };
