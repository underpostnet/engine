import crypto from 'crypto';
import mongoose from 'mongoose';
import { UserDto } from './user.model.js';
import { ValkeyAPI } from '../../db/valkey/Valkey.js';
import { jwtSign } from '../../server/security/auth.js';
import { counter } from '../../server/ops/metrics.js';

/**
 * Minutes a guest identity and its token live without use: `GUEST_SESSION_MINUTES`, default 60.
 * Each use renews both.
 * @returns {number}
 */
const guestMinutes = () => {
  const minutes = Number.parseInt(process.env.GUEST_SESSION_MINUTES, 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
};

/** The Valkey key of a guest: its own namespace, by its unique id. */
const guestKey = (id) => `guest:${id}`;

const guestSessions = counter({
  name: 'underpost_guest_sessions_total',
  help: 'Guest identities by event: created, renewed, expired, or unavailable when Valkey refused',
  labelNames: ['event'],
});

/**
 * A new ephemeral guest. The id is an ObjectId; the name carries 40 random bits.
 * @returns {object}
 */
const buildGuestUser = () => {
  const now = new Date().toISOString();
  return {
    _id: `guest${new mongoose.Types.ObjectId().toString()}`,
    username: `guest${crypto.randomBytes(5).toString('hex')}`,
    role: 'guest',
    emailConfirmed: false,
    profileImageId: null,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Projects a guest to the public-safe fields of UserDto.select.get().
 * @param {object} user
 * @returns {object}
 */
const toPublicUser = (user) => {
  const select = UserDto.select.get();
  return Object.fromEntries(
    Object.keys(select)
      .filter((k) => select[k] === 1 && k in user)
      .map((k) => [k, user[k]]),
  );
};

/** Stores a guest for one lifetime and signs a token of the same lifetime. */
const renew = async (req, user, options) => {
  const minutes = guestMinutes();
  try {
    await ValkeyAPI.set(options, guestKey(user._id), user, minutes * 60 * 1000);
  } catch (error) {
    guestSessions.inc({ event: 'unavailable' });
    throw error;
  }
  return jwtSign(
    UserDto.auth.payload(user, null, req.ip, req.headers['user-agent'], options.host, options.path),
    options,
    minutes,
    minutes,
  );
};

class GuestService {
  /** A new guest identity and its token. */
  static async create(req, options) {
    const user = buildGuestUser();
    const token = await renew(req, user, options);
    guestSessions.inc({ event: 'created' });
    return { token, user: toPublicUser(user) };
  }

  /** The guest of a token, renewed with a fresh token. */
  static async auth(req, options) {
    const user = await GuestService.find(req.auth.user._id, options);
    if (!user) {
      guestSessions.inc({ event: 'expired' });
      throw new Error('guest user expired');
    }
    const token = await renew(req, user, options);
    guestSessions.inc({ event: 'renewed' });
    return { user: toPublicUser(user), token };
  }

  /**
   * The stored guest of an id, or null once it expired.
   * @param {string} id
   * @param {{host: string, path: string}} options
   * @returns {Promise<object|null>}
   */
  static async find(id, options) {
    return typeof id === 'string' && id.startsWith('guest') ? await ValkeyAPI.get(options, guestKey(id)) : null;
  }
}

export { GuestService };
