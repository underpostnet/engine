import { Schema, model } from 'mongoose';
import validator from 'validator';
import { userRoleEnum } from '../../client/components/core/CommonJs.js';
import crypto from 'crypto';
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
    password: { type: String, trim: true, required: 'Password is required' },
    username: {
      type: String,
      trim: true,
      unique: true,
      required: 'Username is required',
      validate: [
        {
          validator: function (username) {
            // Allow only alphanumeric characters, hyphens, and underscores (URI-safe)
            return /^[a-zA-Z0-9_-]+$/.test(username);
          },
          message: 'Username can only contain letters, numbers, hyphens, and underscores',
        },
        {
          validator: function (username) {
            // Length validation
            return username && username.length >= 2 && username.length <= 20;
          },
          message: 'Username must be between 2 and 20 characters',
        },
      ],
    },
    role: { type: String, enum: userRoleEnum, default: 'guest' },
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
    publicKey: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'Crypto',
        },
      ],
      default: [],
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

const UserDto = {
  select: {
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
  },
  public: {
    get: () => {
      return {
        _id: 1,
        username: 1,
        profileImageId: 1,
        publicProfile: 1,
        briefDescription: 1,
        createdAt: 1,
      };
    },
  },
  auth: {
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
  },
};

export { UserSchema, UserModel, userRoleEnum, ProviderSchema, UserDto };
