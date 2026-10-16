/**
 * Friendships between accounts: requests, answers, removals and the friend list with presence.
 *
 * The actor always comes from the game server session. A friendship id from a client only names a
 * pair the actor belongs to.
 *
 * @module src/projects/cyberia/player/friendship.js
 * @namespace CyberiaFriendship
 */
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  FRIEND_REQUESTS_MAX,
  FRIEND_REQUEST_DAYS,
  FRIENDS_MAX,
} from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { presenceOf } from './player-session.js';

const model = (name, context) => DataBaseProviderService.getModel(name, context);
const pairOf = (a, b) => (String(a) < String(b) ? { low: a, high: b } : { low: b, high: a });
const sideOf = (account) => ({ $or: [{ low: account }, { high: account }] });
// A request past its expiry is gone, whether or not the TTL monitor deleted it yet.
const live = (now = new Date()) => ({ $or: [{ status: 'accepted' }, { expiresAt: { $gt: now } }] });
const otherOf = (doc, account) => (String(doc.low) === String(account) ? doc.high : doc.low);

const countFriends = async (account, context) =>
  await model('CyberiaFriendship', context).countDocuments({ ...sideOf(account), status: 'accepted' });

/**
 * The friendships and requests of an account as it sees them, with the presence of its friends.
 * @param {*[]} docs - Lean `CyberiaFriendship` documents of the account.
 * @param {*} account
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<Object[]>} Wire `Friend` rows.
 */
const friendRows = async (docs, account, context) => {
  const others = docs.map((doc) => otherOf(doc, account));
  const friends = docs.filter((doc) => doc.status === 'accepted').map((doc) => otherOf(doc, account));
  const [users, presence] = await Promise.all([
    model('User', context)
      .find({ _id: { $in: others } }, { username: 1 })
      .lean(),
    presenceOf(friends, context),
  ]);
  const userOf = new Map(users.map((u) => [String(u._id), u]));
  return docs
    .map((doc) => {
      const other = String(otherOf(doc, account));
      const user = userOf.get(other);
      if (!user) return null;
      const accepted = doc.status === 'accepted';
      const where = accepted ? presence.get(other) : undefined;
      return {
        friendshipId: String(doc._id),
        accountId: other,
        name: user.username,
        status: accepted ? 'friend' : String(doc.requester) === String(account) ? 'outgoing' : 'incoming',
        online: !!where,
        instanceCode: where?.instanceCode ?? '',
        mapCode: where?.mapCode ?? '',
        expiresAtMs: !accepted && doc.expiresAt ? doc.expiresAt.getTime() : 0,
      };
    })
    .filter(Boolean);
};

/**
 * The friend list of an account.
 * @param {{accountId: string}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{friends: Object[]}>}
 * @memberof CyberiaFriendship
 */
const listFriends = async ({ accountId }, context) => {
  if (!mongoose.isValidObjectId(accountId)) return { friends: [] };
  const docs = await model('CyberiaFriendship', context)
    .find({ $and: [sideOf(accountId), live()] })
    .lean();
  return { friends: await friendRows(docs, accountId, context) };
};

const answer = async (doc, account, context) => ({
  refusal: '',
  friend: doc ? (await friendRows([doc], account, context))[0] : undefined,
});

const request = async (account, target, context) => {
  if (!mongoose.isValidObjectId(target)) return { refusal: 'unknown' };
  if (String(target) === String(account)) return { refusal: 'self' };
  if (!(await model('User', context).exists({ _id: target, role: { $ne: 'guest' } }))) return { refusal: 'unknown' };
  const Friendship = model('CyberiaFriendship', context);
  const pair = pairOf(new mongoose.Types.ObjectId(String(account)), new mongoose.Types.ObjectId(String(target)));
  await Friendship.deleteOne({ ...pair, status: 'pending', expiresAt: { $lte: new Date() } });
  const existing = await Friendship.findOne(pair).lean();
  if (existing?.status === 'pending' && String(existing.requester) === String(target))
    return await accept(account, existing._id, context);
  if (existing) return { refusal: 'exists' };
  const open = await Friendship.countDocuments({
    ...sideOf(account),
    status: 'pending',
    requester: account,
    expiresAt: { $gt: new Date() },
  });
  if (open >= FRIEND_REQUESTS_MAX || (await countFriends(account, context)) >= FRIENDS_MAX) return { refusal: 'limit' };
  try {
    const doc = await Friendship.create({
      ...pair,
      requester: account,
      expiresAt: new Date(Date.now() + FRIEND_REQUEST_DAYS * 24 * 60 * 60 * 1000),
    });
    return await answer(doc.toObject(), account, context);
  } catch (error) {
    if (error?.code === 11000) return { refusal: 'exists' };
    throw error;
  }
};

const accept = async (account, friendshipId, context) => {
  const Friendship = model('CyberiaFriendship', context);
  const pending = await Friendship.findOne({
    _id: friendshipId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
    requester: { $ne: account },
    ...sideOf(account),
  }).lean();
  if (!pending) return { refusal: 'not_found' };
  const counts = await Promise.all([pending.low, pending.high].map((side) => countFriends(side, context)));
  if (counts.some((count) => count >= FRIENDS_MAX)) return { refusal: 'limit' };
  const doc = await Friendship.findOneAndUpdate(
    { _id: pending._id, status: 'pending', expiresAt: { $gt: new Date() } },
    { $set: { status: 'accepted', acceptedAt: new Date() }, $unset: { expiresAt: 1 } },
    { returnDocument: 'after' },
  ).lean();
  return doc ? await answer(doc, account, context) : { refusal: 'not_found' };
};

/**
 * Applies one friendship action of an account.
 * @param {{accountId: string, action: string, targetAccountId?: string, friendshipId?: string}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{refusal: string, friend?: Object}>}
 * @memberof CyberiaFriendship
 */
const updateFriendship = async ({ accountId, action, targetAccountId, friendshipId }, context) => {
  if (!mongoose.isValidObjectId(accountId)) return { refusal: 'unknown' };
  if (action === 'request') return await request(accountId, targetAccountId, context);
  if (!mongoose.isValidObjectId(friendshipId)) return { refusal: 'not_found' };
  if (action === 'accept') return await accept(accountId, friendshipId, context);
  if (action === 'decline' || action === 'remove') {
    const removed = await model('CyberiaFriendship', context)
      .findOneAndDelete({
        _id: friendshipId,
        status: action === 'decline' ? 'pending' : 'accepted',
        ...sideOf(accountId),
      })
      .lean();
    return removed ? await answer(removed, accountId, context) : { refusal: 'not_found' };
  }
  return { refusal: 'unknown' };
};

export { listFriends, updateFriendship };
