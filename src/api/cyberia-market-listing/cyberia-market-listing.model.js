/**
 * Mongoose model for `CyberiaMarketListing`: one stack a player offers in a market, from the commit
 * that took it from the profile until it is sold, cancelled or ends.
 *
 * Every change commits in the transaction of the operation that makes it, with the state of the
 * player who acts: list, cancel, buy and bid. `revision` rises with each change, so an operation that
 * names an older revision is refused. A listing that ends settles once: its goods go to claims. A
 * final listing becomes purgeable; an open one never does.
 *
 * @module src/api/cyberia-market-listing/cyberia-market-listing.model.js
 */

import { Schema, model } from 'mongoose';
import { MARKET_MODES, MARKET_SCOPES } from '../cyberia-server-defaults/cyberia-server-defaults.js';

/** An open listing takes buys or bids; every other status is final. */
const MARKET_LISTING_STATUSES = Object.freeze(['open', 'sold', 'cancelled', 'expired']);

/** Days a final listing stays readable. */
const MARKET_RECORD_DAYS = 30;

const CyberiaMarketListingSchema = new Schema(
  {
    // The id of the list operation that created it.
    listingId: { type: String, required: true, unique: true, trim: true },
    marketCode: { type: String, required: true },
    scope: { type: String, enum: MARKET_SCOPES, required: true },
    // The world of an instance market, the universe of a universe market.
    scopeKey: { type: String, required: true },
    instanceCode: { type: String, required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', required: true },
    sellerName: { type: String, default: '' },
    itemId: { type: String, required: true },
    olCid: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    mode: { type: String, enum: MARKET_MODES, required: true },
    // The fixed price, or the opening bid of an auction.
    price: { type: Number, required: true, min: 1 },
    bid: { type: Number, default: 0 },
    bidder: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', default: null },
    bids: { type: Number, default: 0 },
    // The terms of the market revision it was listed under: the fees it paid and pays from the
    // proceeds, and how a bid raises the highest one up to the highest price.
    marketRevision: { type: Number, required: true, min: 0 },
    listingFee: { type: Number, required: true, min: 0 },
    saleFee: { type: Number, required: true, min: 0 },
    raisePercent: { type: Number, required: true, min: 1 },
    minRaise: { type: Number, required: true, min: 1 },
    priceMax: { type: Number, required: true, min: 1 },
    status: { type: String, enum: MARKET_LISTING_STATUSES, default: 'open' },
    revision: { type: Number, default: 0 },
    endsAt: { type: Date, required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'CyberiaPlayer', default: null },
    settledAt: { type: Date, default: null },
    purgeAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CyberiaMarketListingSchema.index({ marketCode: 1, scope: 1, scopeKey: 1, status: 1, endsAt: 1 });
CyberiaMarketListingSchema.index({ status: 1, endsAt: 1 });
CyberiaMarketListingSchema.index({ seller: 1, status: 1 });
CyberiaMarketListingSchema.index({ bidder: 1, status: 1 });
CyberiaMarketListingSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const CyberiaMarketListingModel = model('CyberiaMarketListing', CyberiaMarketListingSchema);

const ProviderSchema = CyberiaMarketListingSchema;

export {
  CyberiaMarketListingSchema,
  CyberiaMarketListingModel,
  ProviderSchema,
  MARKET_LISTING_STATUSES,
  MARKET_RECORD_DAYS,
};
