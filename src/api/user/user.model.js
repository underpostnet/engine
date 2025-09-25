import { Schema, model } from 'mongoose';
import validator from 'validator';
import { userRoleEnum } from '../../client/components/core/CommonJs.js';

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
    role: { type: String, enum: userRoleEnum, default: 'guest' },
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
    // TODO: -> set login device, location, ip, fingerprint
    //          and validate on authorization middleware
    //       -> dynamic refresh 100 tokens per session with 12h interval
    //       -> back secret per user, registrarion user model -> secret: { type: String }
    payload: (user) => ({ _id: user._id.toString(), role: user.role, email: user.email }),
  },
};

export { UserSchema, UserModel, userRoleEnum, ProviderSchema, UserDto };
