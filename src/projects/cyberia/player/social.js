import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  FRIEND_REQUESTS_MAX,
  FRIEND_REQUEST_DAYS,
  FRIENDS_MAX,
  STATUS_NOTE_INTERVAL_MS,
  cleanStatusNote,
  validStatusNote,
} from '../../../api/cyberia-social/social-contract.js';
import { identityPreviews } from './identity.js';
import { canonicalPair } from '../../../api/cyberia-social/relationship.js';

const model = (name, context) => DataBaseProviderService.getModel(name, context);
const sideOf = (account) => ({ $or: [{ low: account }, { high: account }] });
const otherOf = (doc, account) => (String(doc.low) === String(account) ? doc.high : doc.low);

const countFriends = async (account, context) =>
  await model('CyberiaSocial', context).countDocuments({ ...sideOf(account), status: 'accepted' });

const friendRows = async (docs, account, context) => {
  const others = docs.map((doc) => otherOf(doc, account));
  const previews = await identityPreviews(account, others, context);
  return docs
    .map((doc) => {
      const other = String(otherOf(doc, account));
      const identity = previews.get(other);
      if (!identity) return null;
      const accepted = doc.status === 'accepted';
      return {
        friendshipId: String(doc._id),
        accountId: other,
        ...identity,
        status: accepted ? 'friend' : String(doc.requester) === String(account) ? 'outgoing' : 'incoming',
        expiresAtMs: !accepted && doc.expiresAt ? doc.expiresAt.getTime() : 0,
      };
    })
    .filter(Boolean);
};

const listFriends = async ({ accountId }, context) => {
  if (!mongoose.isValidObjectId(accountId)) return { friends: [], note: '' };
  const Social = model('CyberiaSocial', context);
  const pending = { ...sideOf(accountId), status: 'pending', expiresAt: { $gt: new Date() } };
  const [accepted, incoming, outgoing, profile] = await Promise.all([
    Social.find({ ...sideOf(accountId), status: 'accepted' })
      .sort({ _id: 1 })
      .limit(FRIENDS_MAX)
      .lean(),
    Social.find({ ...pending, requester: { $ne: accountId } })
      .sort({ _id: 1 })
      .limit(FRIEND_REQUESTS_MAX)
      .lean(),
    Social.find({ ...pending, requester: accountId })
      .sort({ _id: 1 })
      .limit(FRIEND_REQUESTS_MAX)
      .lean(),
    model('CyberiaSocialProfile', context).findOne({ user: accountId }, { note: 1, noteUpdatedAt: 1 }).lean(),
  ]);
  const docs = new Map([...incoming, ...outgoing, ...accepted].map((doc) => [String(doc._id), doc]));
  return {
    friends: await friendRows([...docs.values()], accountId, context),
    note: profile?.note ?? '',
    noteNextUpdateAtMs: profile?.noteUpdatedAt ? profile.noteUpdatedAt.getTime() + STATUS_NOTE_INTERVAL_MS : 0,
  };
};

const answer = async (doc, account, context) => ({
  refusal: '',
  friend: doc ? (await friendRows([doc], account, context))[0] : undefined,
});

const request = async (account, target, context) => {
  if (!mongoose.isValidObjectId(target)) return { refusal: 'unknown' };
  account = new mongoose.Types.ObjectId(String(account));
  target = new mongoose.Types.ObjectId(String(target));
  if (String(target) === String(account)) return { refusal: 'self' };
  if (!(await model('User', context).exists({ _id: target, role: { $ne: 'guest' } }))) return { refusal: 'unknown' };
  const Social = model('CyberiaSocial', context);
  const pair = canonicalPair(account, target);
  await Social.deleteOne({ ...pair, status: 'pending', expiresAt: { $lte: new Date() } });
  const existing = await Social.findOne(pair).lean();
  if (existing?.status === 'pending' && String(existing.requester) === String(target))
    return await accept(account, existing._id, context);
  if (existing) return { refusal: 'exists' };
  const open = await Social.countDocuments({
    ...sideOf(account),
    status: 'pending',
    requester: account,
    expiresAt: { $gt: new Date() },
  });
  if (open >= FRIEND_REQUESTS_MAX || (await countFriends(account, context)) >= FRIENDS_MAX) return { refusal: 'limit' };
  try {
    const doc = await Social.create({
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
  const Social = model('CyberiaSocial', context);
  const pending = await Social.findOne({
    _id: friendshipId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
    requester: { $ne: account },
    ...sideOf(account),
  }).lean();
  if (!pending) return { refusal: 'not_found' };
  const counts = await Promise.all([pending.low, pending.high].map((side) => countFriends(side, context)));
  if (counts.some((count) => count >= FRIENDS_MAX)) return { refusal: 'limit' };
  const doc = await Social.findOneAndUpdate(
    { _id: pending._id, status: 'pending', $expr: { $gt: ['$expiresAt', '$$NOW'] } },
    { $set: { status: 'accepted' }, $currentDate: { acceptedAt: true }, $unset: { expiresAt: 1 } },
    { returnDocument: 'after' },
  ).lean();
  return doc ? await answer(doc, account, context) : { refusal: 'not_found' };
};

const updateFriendship = async ({ accountId, action, targetAccountId, friendshipId }, context) => {
  if (!mongoose.isValidObjectId(accountId)) return { refusal: 'unknown' };
  if (action === 'request') return await request(accountId, targetAccountId, context);
  if (!mongoose.isValidObjectId(friendshipId)) return { refusal: 'not_found' };
  if (action === 'accept') return await accept(accountId, friendshipId, context);
  if (action === 'decline' || action === 'remove') {
    const removed = await model('CyberiaSocial', context)
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

const updateStatusNote = async ({ accountId, note }, context) => {
  if (!mongoose.isValidObjectId(accountId)) return { refusal: 'unknown' };
  if (typeof note !== 'string') return { refusal: 'invalid' };
  const text = cleanStatusNote(note);
  if (!validStatusNote(text)) return { refusal: 'too_long' };
  if (!(await model('User', context).exists({ _id: accountId, role: { $ne: 'guest' } }))) return { refusal: 'unknown' };
  const Profile = model('CyberiaSocialProfile', context);
  try {
    await Profile.updateOne(
      { user: accountId },
      { $setOnInsert: { user: accountId, note: '', noteUpdatedAt: null, createdAt: new Date() } },
      { upsert: true, timestamps: false },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  const profile = await Profile.findOneAndUpdate(
    {
      user: accountId,
      $or: [
        { noteUpdatedAt: null },
        {
          $expr: { $lte: ['$noteUpdatedAt', { $subtract: ['$$NOW', STATUS_NOTE_INTERVAL_MS] }] },
        },
      ],
    },
    { $set: { note: text }, $currentDate: { noteUpdatedAt: true } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (profile)
    return {
      refusal: '',
      note: profile.note,
      nextUpdateAtMs: profile.noteUpdatedAt.getTime() + STATUS_NOTE_INTERVAL_MS,
    };
  const current = await Profile.findOne({ user: accountId }, { noteUpdatedAt: 1 }).lean();
  return current?.noteUpdatedAt
    ? { refusal: 'too_soon', nextUpdateAtMs: current.noteUpdatedAt.getTime() + STATUS_NOTE_INTERVAL_MS }
    : { refusal: 'unknown' };
};

export { listFriends, updateFriendship, updateStatusNote };
