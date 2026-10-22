/**
 * Mongoose model for `CyberiaMarket`: the shared contract of one market.
 *
 * A terminal names a profile by `code` (`CyberiaAction.market.marketCode`) and opens the market of
 * its world (`scope: instance`) or of the universe of its world (`scope: universe`). The listings and
 * the claims stay in the host records; a listing records the terms of the revision it was listed
 * under. Each write raises `revision`, and the world version folds it in.
 *
 * @module src/api/cyberia-market/cyberia-market.model.js
 */

import { Schema, model } from 'mongoose';
import {
  CURRENCY_CODES,
  MARKET_HOURS,
  MARKET_MODES,
  MARKET_PROFILE_DEFAULTS,
  MARKET_PROFILE_LIMITS,
  MARKET_SCOPES,
  MARKET_STATUSES,
  resolveMarketProfile,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';

const block = (name) =>
  new Schema(
    Object.fromEntries(
      Object.entries(MARKET_PROFILE_LIMITS[name]).map(([key, [min, max]]) => [
        key,
        { type: Number, default: MARKET_PROFILE_DEFAULTS[name][key], min, max, validate: Number.isInteger },
      ]),
    ),
    { _id: false, strict: 'throw' },
  );

const CyberiaMarketSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    // A retired market takes no new listing; its open listings run to their end and settle.
    status: { type: String, enum: MARKET_STATUSES, default: 'active' },
    revision: { type: Number, default: 1, min: 1 },
    scope: { type: String, enum: MARKET_SCOPES, default: MARKET_PROFILE_DEFAULTS.scope },
    currencyCode: { type: String, enum: CURRENCY_CODES, default: MARKET_PROFILE_DEFAULTS.currencyCode },
    modes: { type: [{ type: String, enum: MARKET_MODES }], default: () => [...MARKET_PROFILE_DEFAULTS.modes] },
    hours: { type: [{ type: Number, enum: MARKET_HOURS }], default: () => [...MARKET_PROFILE_DEFAULTS.hours] },
    auction: { type: block('auction'), default: () => ({}) },
    fees: { type: block('fees'), default: () => ({}) },
    limits: { type: block('limits'), default: () => ({}) },
  },
  { timestamps: true },
);

CyberiaMarketSchema.pre('validate', function () {
  resolveMarketProfile(this.toObject());
});

const CyberiaMarketModel = model('CyberiaMarket', CyberiaMarketSchema);

const ProviderSchema = CyberiaMarketSchema;

export { CyberiaMarketSchema, CyberiaMarketModel, ProviderSchema };
