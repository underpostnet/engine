import { Schema, model } from 'mongoose';
import { CommonValidationRules } from '../../client/components/core/CommonValidationRules.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const UserSchema = new Schema({
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    required: 'Email address is required',
    validate: [CommonValidationRules.validEmail, 'Please fill a valid email address'],
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address'],
  },
  password: { type: String, trim: true, required: 'Password is required' },
  username: { type: String, trim: true, unique: true, required: 'Username is required' },
  role: { type: String, enum: ['admin', 'moderator', 'user', 'guest'], default: 'guest' },
});

const UserModel = model('User', UserSchema);

export { UserSchema, UserModel };
