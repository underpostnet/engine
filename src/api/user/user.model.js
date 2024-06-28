import { Schema, model } from 'mongoose';
import validator from 'validator';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const userRoleEnum = ['admin', 'moderator', 'user', 'guest'];

const UserSchema = new Schema({
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
  password: { type: String, trim: true, required: 'Password is required' },
  username: { type: String, trim: true, unique: true, required: 'Username is required' },
  role: { type: String, enum: userRoleEnum, default: 'guest' },
  publicKey: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Crypto',
    },
  ],
});

const UserModel = model('User', UserSchema);

export { UserSchema, UserModel, userRoleEnum };
