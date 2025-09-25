import { Schema, model } from 'mongoose';
import validator from 'validator';
import { s4, userRoleEnum } from '../../client/components/core/CommonJs.js';

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
    username: { type: String, trim: true, unique: true, required: 'Username is required' },
    secret: { type: String, default: () => s4() + s4() + s4() + s4() },
    role: { type: String, enum: userRoleEnum, default: 'guest' },
    activeSessions: {
      type: [
        {
          tokenHash: { type: String, required: true },
          ip: { type: String },
          userAgent: { type: String },
          expiresAt: { type: Date, required: true },
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
      return { _id: 1, username: 1, email: 1, role: 1, emailConfirmed: 1, profileImageId: 1 };
    },
    getAll: () => {
      return { _id: 1 };
    },
  },
  auth: {
    payload: (user, sessionId, ip, userAgent) => ({
      _id: user._id.toString(),
      role: user.role,
      email: user.email,
      jti: sessionId, // JWT ID
      ip,
      userAgent,
    }),
  },
};

export { UserSchema, UserModel, userRoleEnum, ProviderSchema, UserDto };
