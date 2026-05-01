import mongoose from 'mongoose';
import { UserDto } from './user.model.js';
import { ValkeyAPI } from '../../server/valkey.js';
import { hashPassword, getBearerToken, jwtSign } from '../../server/auth.js';

// ─── TTL ──────────────────────────────────────────────────────────────────────

const _guestTtlMs = () => {
  const minutes = Number.parseInt(process.env.REFRESH_EXPIRE_MINUTES || '60', 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 60 * 60 * 1000;
};

// ─── Domain helpers ───────────────────────────────────────────────────────────

/**
 * Constructs a new ephemeral guest user object.
 * This is domain logic specific to the guest lifecycle; it does not belong
 * in the generic Valkey storage module.
 *
 * @param {{ host?: string }} options
 * @returns {object}
 */
const buildGuestUser = (options) => {
  const now = new Date().toISOString();
  const _id = new mongoose.Types.ObjectId().toString();
  const role = 'guest';
  return {
    _id: `${role}${_id}`,
    username: `${role}${_id.slice(-5)}`,
    email: `${_id}@${options.host || 'localhost'}`,
    password: hashPassword(process.env.JWT_SECRET),
    role,
    emailConfirmed: false,
    profileImageId: null,
    publicKey: [],
    phoneNumbers: [],
    activeSessions: [],
    failedLoginAttempts: 0,
    recoverTimeOut: null,
    lastLoginDate: null,
    createdAt: now,
    updatedAt: now,
    guestSessionExpiresAt: Date.now() + _guestTtlMs(),
  };
};

/**
 * Projects a user object to the public-safe fields defined by UserDto.select.get().
 * Keeps this logic next to the guest domain instead of in a generic utility.
 *
 * @param {object} user
 * @returns {object}
 */
const _toPublicUser = (user) => {
  const select = UserDto.select.get();
  return Object.fromEntries(
    Object.keys(select)
      .filter((k) => select[k] === 1 && k in user)
      .map((k) => [k, user[k]]),
  );
};

const _withRefreshedExpiry = (user) => ({ ...user, guestSessionExpiresAt: Date.now() + _guestTtlMs() });

// ─── Service ──────────────────────────────────────────────────────────────────

class GuestService {
  static async create(req, options) {
    const user = buildGuestUser(options);

    await ValkeyAPI.set(options, user.email, user, _guestTtlMs());

    return {
      token: jwtSign(
        UserDto.auth.payload(user, null, req.ip, req.headers['user-agent'], options.host, options.path),
        options,
      ),
      user: _toPublicUser(user),
    };
  }

  static async auth(req, options) {
    const user = await ValkeyAPI.get(options, req.auth.user.email);
    if (!user) throw new Error('guest user expired');

    const expiresAt = Number(user.guestSessionExpiresAt || 0);
    if (expiresAt && expiresAt <= Date.now()) throw new Error('guest user expired');

    const refreshed = _withRefreshedExpiry(user);
    await ValkeyAPI.set(options, refreshed.email, refreshed, _guestTtlMs());

    return {
      user: _toPublicUser(refreshed),
      token: getBearerToken(req),
    };
  }
}

export { GuestService };
