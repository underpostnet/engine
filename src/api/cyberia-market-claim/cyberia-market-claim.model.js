/**
 * Mongoose model for `CyberiaMarketClaim`: coins or a stack a market owes one player profile. A
 * sale, an outbid, an auction won and a listing that ended unsold each owe a claim; its owner may
 * play elsewhere, so the market never writes a profile directly. A collect operation takes the
 * pending claims of a player into its state, once.
 *
 * `claimId` derives from the listing and the reason, so one event owes one claim. A collected claim
 * becomes purgeable; a pending one never does.
 *
 * @module src/api/cyberia-market-claim/cyberia-market-claim.model.js
 */

import { Schema, model } from 'mongoose';
import { MARKET_SCOPES } from '../cyberia-server-defaults/cyberia-server-defaults.js';

/** Why a market owes a claim. */
const MARKET_CLAIM_REASONS = Object.freeze(['sale', 'won', 'outbid', 'unsold']);

const CyberiaMarketClaimSchema = new Schema(
  {
    claimId: { type: String, required: true, unique: true, trim: true },
    player: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', required: true },
    listingId: { type: String, required: true },
    // The market of the listing that owes it.
    marketCode: { type: String, required: true },
    scope: { type: String, enum: MARKET_SCOPES, required: true },
    scopeKey: { type: String, required: true },
    reason: { type: String, enum: MARKET_CLAIM_REASONS, required: true },
    coins: { type: Number, default: 0, min: 0 },
    itemId: { type: String, default: '' },
    olCid: { type: String, default: '' },
    quantity: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['pending', 'collected'], default: 'pending' },
    collectedAt: { type: Date, default: null },
    purgeAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CyberiaMarketClaimSchema.index({ player: 1, status: 1, createdAt: 1 });
CyberiaMarketClaimSchema.index({ marketCode: 1, scopeKey: 1, status: 1 });
CyberiaMarketClaimSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const CyberiaMarketClaimModel = model('CyberiaMarketClaim', CyberiaMarketClaimSchema);

const ProviderSchema = CyberiaMarketClaimSchema;

export { CyberiaMarketClaimSchema, CyberiaMarketClaimModel, ProviderSchema, MARKET_CLAIM_REASONS };
