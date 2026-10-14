/**
 * Mongoose model for the GoogleAuth API: the Google account a user signs in with.
 *
 * Google's OpenID Connect subject (`sub`) is the identity, never the email. A record holds no
 * Google token: sign-in reads the profile once and keeps only the hash of a one-time ticket
 * that hands the session to the browser.
 *
 * @module src/api/google-auth/google-auth.model.js
 * @namespace GoogleAuthModel
 */
import { Schema, model } from 'mongoose';

/**
 * @typedef {Object} GoogleAuth
 * @property {string} subject - Google `sub`, unique
 * @property {Types.ObjectId} userId - The user this Google account signs in as, unique
 * @property {string} email - Email Google reported at the last sign-in
 * @property {boolean} emailVerified - Whether Google verified that email
 * @property {string} [ticketHash] - SHA-256 of the pending session ticket
 * @property {Date} [ticketExpiresAt] - When the pending ticket stops being valid
 * @memberof GoogleAuthModel
 */
const GoogleAuthSchema = new Schema(
  {
    subject: { type: String, required: true, unique: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    emailVerified: { type: Boolean, default: false },
    ticketHash: { type: String },
    ticketExpiresAt: { type: Date },
  },
  { timestamps: true, strict: 'throw' },
);

GoogleAuthSchema.index({ ticketHash: 1 }, { sparse: true });

const GoogleAuthModel = model('GoogleAuth', GoogleAuthSchema);
const ProviderSchema = GoogleAuthSchema;

export { GoogleAuthSchema, GoogleAuthModel, ProviderSchema };
