import { Schema, model } from 'mongoose';
import validator from 'validator';
import {
  userRoleEnum,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../../client/components/core/CommonJs.js';
import crypto from 'crypto';

/** The kinds of an operator restriction: a lock ends at its time; a ban ends at its time, or never. */
const ACCOUNT_RESTRICTIONS = Object.freeze(['lock', 'ban']);

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html
const UserSchema = new Schema(
  {
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: 'Email address is required',
      validate: [validator.isEmail, 'Please fill a valid email address'],
      // match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address'],
    },
    emailConfirmed: { type: Boolean, default: false },
    recoverTimeOut: { type: Date },
    lastLoginDate: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    // Absent on an account that signs in only with a provider, such as Google.
    password: { type: String, trim: true },
    username: {
      type: String,
      trim: true,
      unique: true,
      required: 'Username is required',
      validate: [
        {
          validator: function (username) {
            // URI-safe: the username is the `/u/:username` path segment
            return USERNAME_PATTERN.test(username);
          },
          message: 'Username can only contain letters, numbers, hyphens, and underscores',
        },
        {
          validator: function (username) {
            return username && username.length >= USERNAME_MIN_LENGTH && username.length <= USERNAME_MAX_LENGTH;
          },
          message: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`,
        },
      ],
    },
    role: { type: String, enum: userRoleEnum, default: 'guest' },
    // While it holds, the account opens no session and its tokens are refused.
    restriction: {
      type: new Schema(
        {
          kind: { type: String, enum: ACCOUNT_RESTRICTIONS, required: true },
          reason: { type: String, required: true, trim: true },
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          at: { type: Date, required: true },
          until: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    activeSessions: {
      type: [
        {
          tokenHash: { type: String, required: true },
          ip: { type: String },
          userAgent: { type: String },
          expiresAt: { type: Date, required: true },
          host: { type: String },
          path: { type: String },
        },
      ],
      default: [],
    },
    profileImageId: { type: Schema.Types.ObjectId, ref: 'File' },
    phoneNumbers: [
      {
        type: {
          type: String,
          enum: ['office', 'home', 'private'],
        },
        number: { type: String },
      },
    ],
    // The wallet identity this user signs in with. Public metadata only; the key stays with
    // the user, and the account record lives in the WalletAccount collection.
    wallet: {
      accountId: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true, lowercase: true },
    },
    associatedCompanies: [
      {
        company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
        context: [{ type: String, enum: ['client', 'supplier', 'employee', 'owner'] }],
      },
    ],
    publicProfile: { type: Boolean, default: false },
    briefDescription: { type: String, default: 'Uploader' },
  },
  {
    timestamps: true,
  },
);
const UserModel = model('User', UserSchema);
const ProviderSchema = UserSchema;
class UserDto {
  static select = {
    get: () => {
      return {
        _id: 1,
        username: 1,
        email: 1,
        role: 1,
        emailConfirmed: 1,
        profileImageId: 1,
        publicProfile: 1,
        briefDescription: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
    getAll: () => {
      return { _id: 1 };
    },
  };
  static public = {
    get: () => {
      return {
        _id: 1,
        username: 1,
        profileImageId: 1,
        publicProfile: 1,
        briefDescription: 1,
        createdAt: 1,
        updatedAt: 1,
      };
    },
  };
  static auth = {
    payload: (user, jwtid, ip, userAgent, host, path) => {
      const tokenPayload = {
        _id: user._id.toString(),
        role: user.role,
        email: user.email,
        ip,
        userAgent,
        host,
        path,
        jwtid: jwtid ?? crypto.randomBytes(8).toString('hex'),
        refreshExpiresAt: Date.now() + parseInt(process.env.REFRESH_EXPIRE_MINUTES) * 60 * 1000,
      };
      return tokenPayload;
    },
  };
}
/**
 * A duplicate email or username as the conflict it is, without database details.
 * @param {Error} error - Error of a user write.
 * @returns {Error} A 409 `duplicate email` or `duplicate username`, else the error itself.
 */
const uniqueConflict = (error) => {
  const field = ['email', 'username'].find((key) => error?.code === 11000 && error.keyPattern?.[key]);
  return field ? Object.assign(new Error(`duplicate ${field}`), { status: 409 }) : error;
};

/**
 * The restriction of an account while it holds, else null.
 * @param {{restriction?: Object|null}|null} user
 * @param {Date} [now]
 * @returns {{kind: string, reason: string, until: Date|null}|null}
 */
const restrictionOf = (user, now = new Date()) =>
  user?.restriction && (!user.restriction.until || new Date(user.restriction.until) > now) ? user.restriction : null;

/**
 * What an account in a restriction is told.
 * @param {{kind: string, until: Date|null}} restriction
 * @returns {string}
 */
const restrictionMessage = ({ kind, until }) =>
  `This account is ${kind === 'ban' ? 'banned' : 'locked'}${until ? ` until ${new Date(until).toISOString()}` : ''}`;

export {
  UserSchema,
  UserModel,
  userRoleEnum,
  ProviderSchema,
  UserDto,
  uniqueConflict,
  ACCOUNT_RESTRICTIONS,
  restrictionOf,
  restrictionMessage,
};
