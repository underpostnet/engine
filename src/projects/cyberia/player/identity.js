import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { FRIENDS_MAX, FRIEND_REQUESTS_MAX } from '../../../api/cyberia-social/social-contract.js';
import { presenceOf } from './player-session.js';
import { accountAppearances } from './appearance-preview.js';
import { loggerFactory } from '../../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

// Account IDs stay inside the engine and the trusted game server.
const identityPreviews = async (viewer, accounts, context) => {
  const ids = [...new Set(accounts.map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!mongoose.isValidObjectId(viewer) || ids.length > FRIENDS_MAX + 2 * FRIEND_REQUESTS_MAX)
    throw new Error('Invalid identity selection');
  const model = (name) => DataBaseProviderService.getModel(name, context);
  const links = await model('CyberiaSocial')
    .find(
      {
        status: 'accepted',
        $or: [
          { low: viewer, high: { $in: ids } },
          { high: viewer, low: { $in: ids } },
        ],
      },
      { low: 1, high: 1 },
    )
    .lean();
  const visible = new Set([
    String(viewer),
    ...links.map((link) => (String(link.low) === String(viewer) ? String(link.high) : String(link.low))),
  ]);
  const privateIds = ids.filter((id) => visible.has(id));
  const [users, profiles, presence, appearances] = await Promise.all([
    model('User')
      .find({ _id: { $in: ids } }, { username: 1 })
      .lean(),
    model('CyberiaSocialProfile')
      .find({ user: { $in: privateIds } }, { user: 1, note: 1 })
      .lean(),
    presenceOf(privateIds, context).catch((error) => {
      logger.warn('Social presence is unavailable', { error: error.message });
      return new Map();
    }),
    accountAppearances(ids, context).catch((error) => {
      logger.warn('Identity appearances are unavailable', { error: error.message });
      return new Map();
    }),
  ]);
  const notes = new Map(profiles.map((profile) => [String(profile.user), profile.note]));
  return new Map(
    users.map((user) => {
      const id = String(user._id);
      const where = visible.has(id) ? presence.get(id) : undefined;
      return [
        id,
        {
          name: user.username,
          avatar: appearances.get(id) ?? '',
          note: notes.get(id) ?? '',
          online: !!where,
          instanceCode: where?.instanceCode ?? '',
          mapCode: where?.mapCode ?? '',
        },
      ];
    }),
  );
};

export { identityPreviews };
