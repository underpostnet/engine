import { Schema, model } from 'mongoose';
import validator from 'validator';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const userRoleEnum = ['admin', 'moderator', 'user', 'guest'];

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
        type: { type: String, enum: ['office', 'home', 'private'], number: { type: String } },
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
      return { _id: 1, name: 1 };
    },
  },
  auth: {
    payload: (user) => ({ _id: user._id.toString(), role: user.role }),
  },
};

export { UserSchema, UserModel, userRoleEnum, ProviderSchema, UserDto };
