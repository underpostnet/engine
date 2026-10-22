/**
 * The markets of an authority: the listings and the claims, the operations a player commits on
 * them, the settlement of listings that end, and the view a market terminal shows.
 *
 * An operation runs in the transaction of the joint commit of its player (`player-state.js`): the
 * state of the player and the change of the market apply together or not at all. A listing checks
 * the current profile of its market and records its terms; every later operation and the settlement
 * use the recorded terms. A listing that ends settles once, in a transaction of its own: its goods
 * become claims. A claim waits until its owner collects it with a joint commit, so the market never
 * writes a profile directly.
 *
 * @module src/projects/cyberia/player/market.js
 * @namespace CyberiaMarket
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  MARKET_HOURS,
  MARKET_MODES,
  MARKET_PAGE,
  minBid,
} from '../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { MARKET_RECORD_DAYS } from '../../../api/cyberia-market-listing/cyberia-market-listing.model.js';
import { ECONOMY_OPERATION_KINDS } from '../../../api/cyberia-economy-operation/cyberia-economy-operation.model.js';
import { scopeKeyOf } from '../economy/market-profile.js';
import { runTransaction } from './transaction.js';

/** The joint commit kinds of the market. */
const MARKET_KINDS = Object.freeze(ECONOMY_OPERATION_KINDS.filter((kind) => kind.startsWith('market_')));

/** Refusals of a market operation. Each refuses the operation and ends no session. */
const MARKET_REFUSALS = Object.freeze({
  gone: 'listing_gone',
  changed: 'listing_changed',
  bidLow: 'bid_low',
  full: 'market_full',
  claimGone: 'claim_gone',
  closed: 'market_closed',
  marketChanged: 'market_changed',
  terms: 'terms_refused',
});

/** Listings one settlement round settles at most: `MARKET_PAGE` per page. */
const SETTLE_PAGES = 5;

const ID_LENGTH = 128;
const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= ID_LENGTH;
const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const isPrice = (value) => isCount(value) && value >= 1;
const isStack = ({ itemId, olCid, quantity } = {}) =>
  isText(itemId) && typeof olCid === 'string' && olCid.length <= ID_LENGTH && isCount(quantity) && quantity >= 1;

const models = (context) => ({
  Listing: DataBaseProviderService.getModel('CyberiaMarketListing', context),
  Claim: DataBaseProviderService.getModel('CyberiaMarketClaim', context),
});

const purgeDate = (now) => new Date(now.getTime() + MARKET_RECORD_DAYS * 86400000);

/** The profile of a market code, or null; the records of a market never need it. */
const findProfile = (code, context, projection = {}) =>
  DataBaseProviderService.getModel('CyberiaMarket', context).findOne({ code }, projection).lean();

/** The coins a sale pays the seller; the terms of a listing never let the sale fee pass its price. */
const proceeds = (price, saleFee) => {
  if (saleFee > price) throw new Error(`sale fee ${saleFee} above price ${price}`);
  return price - saleFee;
};

/**
 * The first defect of the market operation of a joint commit of kind, or ''.
 * @param {string} kind
 * @param {Object} market - Wire `MarketOp`.
 * @returns {string}
 * @memberof CyberiaMarket
 */
const marketOpDefect = (kind, market) => {
  if (!isText(market?.marketCode)) return 'bad market';
  switch (kind) {
    case 'market_list':
      if (!MARKET_MODES.includes(market.mode) || !isStack(market)) return 'bad listing stack or mode';
      if (!isPrice(market.price) || !MARKET_HOURS.includes(market.hours)) return 'bad price or hours';
      return isCount(market.listingFee) && isCount(market.saleFee) ? '' : 'bad fees';
    case 'market_cancel':
      return isText(market.listingId) && isStack(market) ? '' : 'bad cancel';
    case 'market_buy':
      return isText(market.listingId) && isStack(market) && isPrice(market.price) ? '' : 'bad buy';
    case 'market_bid':
      return isText(market.listingId) && isPrice(market.price) ? '' : 'bad bid';
    case 'market_collect':
      if (!Array.isArray(market.claimIds) || market.claimIds.length < 1 || market.claimIds.length > MARKET_PAGE)
        return 'bad claims';
      if (!market.claimIds.every(isText) || new Set(market.claimIds).size !== market.claimIds.length)
        return 'bad claims';
      return isCount(market.coins) && (market.stacks ?? []).every(isStack) ? '' : 'bad claim goods';
  }
  return 'bad market kind';
};

/** Why an operation on a listing that did not match is refused. */
const listingRefusal = async (Listing, listingId, session) =>
  (await Listing.exists({ listingId, status: 'open' }).session(session))
    ? MARKET_REFUSALS.changed
    : MARKET_REFUSALS.gone;

/** The same stack: item, definition and units. */
const sameStack = (a, b) => a.itemId === b.itemId && a.olCid === b.olCid && a.quantity === b.quantity;

/** The market a listing or a claim belongs to. */
const marketKey = ({ marketCode, scope, scopeKey }) => ({ marketCode, scope, scopeKey });

/**
 * Why a profile refuses a new listing, or ''. The fees must be the ones the seller saw.
 * @param {Object|null} profile - Lean `CyberiaMarket`.
 * @param {Object} market - Wire `MarketOp` of a list.
 * @returns {string}
 */
const listingTermsRefusal = (profile, market) => {
  if (!profile || profile.status !== 'active') return MARKET_REFUSALS.closed;
  if (profile.fees.listing !== market.listingFee || profile.fees.sale !== market.saleFee)
    return MARKET_REFUSALS.marketChanged;
  const { priceMin, priceMax } = profile.limits;
  if (!profile.modes.includes(market.mode) || !profile.hours.includes(market.hours)) return MARKET_REFUSALS.terms;
  return market.price < priceMin || market.price > priceMax ? MARKET_REFUSALS.terms : '';
};

/**
 * Applies the market operation of a joint commit in its transaction, before the state of its
 * player is written. A refusal writes nothing.
 * @param {{kind: string, market: Object, operationId: string, playerId: string, instanceCode: string}} op
 * @param {import('mongoose').ClientSession} session
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<string>} '' or a refusal of `MARKET_REFUSALS`.
 * @memberof CyberiaMarket
 */
const applyMarketOp = async ({ kind, market, operationId, playerId, instanceCode }, session, context) => {
  const { Listing, Claim } = models(context);
  const now = new Date();
  const { listingId, revision } = market;
  const open = { listingId, status: 'open', revision, endsAt: { $gt: now } };
  const stack = { itemId: market.itemId, olCid: market.olCid, quantity: market.quantity };
  switch (kind) {
    case 'market_list': {
      const profile = await findProfile(market.marketCode, context);
      const refusal = listingTermsRefusal(profile, market);
      if (refusal) return refusal;
      const scopeKey = await scopeKeyOf(profile.scope, instanceCode, context);
      if (!scopeKey) return MARKET_REFUSALS.closed;
      const key = { marketCode: profile.code, scope: profile.scope, scopeKey };
      if (
        (await Listing.countDocuments({ ...key, seller: playerId, status: 'open' }).session(session)) >=
        profile.limits.listingsPerPlayer
      )
        return MARKET_REFUSALS.full;
      await Listing.create(
        [
          {
            listingId: operationId,
            ...key,
            instanceCode,
            seller: playerId,
            sellerName: market.sellerName,
            ...stack,
            mode: market.mode,
            price: market.price,
            marketRevision: profile.revision,
            listingFee: profile.fees.listing,
            saleFee: profile.fees.sale,
            raisePercent: profile.auction.raisePercent,
            minRaise: profile.auction.minRaise,
            priceMax: profile.limits.priceMax,
            endsAt: new Date(now.getTime() + market.hours * 3600000),
          },
        ],
        { session },
      );
      return '';
    }
    case 'market_cancel': {
      const { modifiedCount } = await Listing.updateOne(
        { ...open, seller: playerId, bids: 0, ...stack },
        { $set: { status: 'cancelled', settledAt: now, purgeAt: purgeDate(now) }, $inc: { revision: 1 } },
        { session },
      );
      return modifiedCount === 1 ? '' : await listingRefusal(Listing, listingId, session);
    }
    case 'market_buy': {
      const sold = await Listing.findOneAndUpdate(
        { ...open, mode: 'fixed', price: market.price, seller: { $ne: playerId }, ...stack },
        {
          $set: { status: 'sold', buyer: playerId, settledAt: now, purgeAt: purgeDate(now) },
          $inc: { revision: 1 },
        },
        { session },
      ).lean();
      if (!sold) return await listingRefusal(Listing, listingId, session);
      await Claim.create(
        [
          {
            claimId: `${listingId}:sale`,
            player: sold.seller,
            listingId,
            ...marketKey(sold),
            reason: 'sale',
            coins: proceeds(sold.price, sold.saleFee),
          },
        ],
        { session },
      );
      return '';
    }
    case 'market_bid': {
      const listing = await Listing.findOne({ ...open, mode: 'auction', seller: { $ne: playerId } })
        .session(session)
        .lean();
      if (!listing) return await listingRefusal(Listing, listingId, session);
      if (market.price > listing.priceMax) return MARKET_REFUSALS.terms;
      if (market.price < minBid(listing)) return MARKET_REFUSALS.bidLow;
      const { modifiedCount } = await Listing.updateOne(
        { _id: listing._id, revision: listing.revision },
        { $set: { bid: market.price, bidder: playerId }, $inc: { bids: 1, revision: 1 } },
        { session },
      );
      if (modifiedCount !== 1) return MARKET_REFUSALS.changed;
      if (listing.bidder)
        await Claim.create(
          [
            {
              claimId: `${listingId}:outbid:${listing.revision}`,
              player: listing.bidder,
              listingId,
              ...marketKey(listing),
              reason: 'outbid',
              coins: listing.bid,
            },
          ],
          { session },
        );
      return '';
    }
    case 'market_collect': {
      const claims = await Claim.find({ claimId: { $in: market.claimIds }, player: playerId, status: 'pending' })
        .session(session)
        .lean();
      const coins = claims.reduce((sum, claim) => sum + claim.coins, 0);
      const stacks = claims.filter((claim) => claim.quantity > 0);
      const asked = market.stacks ?? [];
      if (
        claims.length !== market.claimIds.length ||
        coins !== market.coins ||
        stacks.length !== asked.length ||
        !stacks.every((claim) => asked.some((st) => sameStack(st, claim)))
      )
        return MARKET_REFUSALS.claimGone;
      await Claim.updateMany(
        { _id: { $in: claims.map(({ _id }) => _id) } },
        { $set: { status: 'collected', collectedAt: now, purgeAt: purgeDate(now) } },
        { session },
      );
      return '';
    }
  }
  return MARKET_REFUSALS.gone;
};

/**
 * Settles one listing that ended, once: the highest bidder wins the stack and the seller the bid
 * less the sale fee, or the seller takes the stack back. A listing another process settled first
 * changes nothing.
 * @param {Object} listing - A lean open listing whose end passed.
 * @param {{host: string, path: string}|string} context
 * @memberof CyberiaMarket
 */
const settleListing = async (listing, context) => {
  const { Listing, Claim } = models(context);
  await runTransaction(Listing, async (session) => {
    const now = new Date();
    const won = listing.mode === 'auction' && listing.bidder;
    const { modifiedCount } = await Listing.updateOne(
      { _id: listing._id, status: 'open', revision: listing.revision, endsAt: { $lte: now } },
      {
        $set: {
          status: won ? 'sold' : 'expired',
          buyer: won ? listing.bidder : null,
          settledAt: now,
          purgeAt: purgeDate(now),
        },
        $inc: { revision: 1 },
      },
      { session },
    );
    if (modifiedCount !== 1) return;
    const { listingId, itemId, olCid, quantity } = listing;
    const owed = { listingId, ...marketKey(listing) };
    const stack = { ...owed, itemId, olCid, quantity };
    const claims = won
      ? [
          { claimId: `${listingId}:won`, player: listing.bidder, reason: 'won', ...stack },
          {
            claimId: `${listingId}:sale`,
            player: listing.seller,
            ...owed,
            reason: 'sale',
            coins: proceeds(listing.bid, listing.saleFee),
          },
        ]
      : [{ claimId: `${listingId}:unsold`, player: listing.seller, reason: 'unsold', ...stack }];
    await Claim.create(claims, { session, ordered: true });
  });
};

/** Settles one page of the listings matching filter whose end passed; the count it settled. */
const settleDue = async (filter, context) => {
  const { Listing } = models(context);
  const due = await Listing.find({ ...filter, status: 'open', endsAt: { $lte: new Date() } })
    .sort({ endsAt: 1 })
    .limit(MARKET_PAGE)
    .lean();
  for (const listing of due) await settleListing(listing, context);
  return due.length;
};

/**
 * One settlement round of every market of the authority: at most `SETTLE_PAGES` pages of ended
 * listings, soonest end first. Safe to run in every process at once: a listing settles once.
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<number>} The listings it read as due.
 * @memberof CyberiaMarket
 */
const settleEnded = async (context) => {
  let settled = 0;
  for (let page = 0; page < SETTLE_PAGES; page++) {
    const count = await settleDue({}, context);
    settled += count;
    if (count < MARKET_PAGE) break;
  }
  return settled;
};

const wireListing = (listing, playerId) => ({
  listingId: listing.listingId,
  revision: listing.revision,
  sellerName: listing.sellerName,
  itemId: listing.itemId,
  olCid: listing.olCid,
  quantity: listing.quantity,
  mode: listing.mode,
  price: listing.price,
  bid: listing.bid,
  bids: listing.bids,
  minBid: listing.mode === 'auction' ? minBid(listing) : 0,
  endsAtMs: listing.endsAt.getTime(),
  mine: String(listing.seller) === playerId,
  leading: String(listing.bidder) === playerId,
});

/** The cursor of the page after a listing: its end, then its id. */
const cursorOf = (listing) => `${listing.endsAt.getTime()}_${listing._id}`;

const afterCursor = (after) => {
  const [ms, id] = String(after || '').split('_');
  if (!(Number(ms) > 0) || !/^[0-9a-f]{24}$/.test(id ?? '')) return {};
  const endsAt = new Date(Number(ms));
  return { $or: [{ endsAt: { $gt: endsAt } }, { endsAt, _id: { $gt: id } }] };
};

/**
 * The view of a market terminal for one player: a page of the open listings of the market of this
 * world, soonest end first, optionally of one item or one mode; the open listings of the player in
 * it; and its pending claims. Listings that ended settle first. A retired market still shows its
 * listings until they end.
 * @param {{instanceCode: string, marketCode: string, playerId: string, itemId?: string, mode?: string, after?: string}} request
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<Object>} Wire `ListMarketResponse`.
 * @memberof CyberiaMarket
 */
const listMarket = async ({ instanceCode, marketCode, playerId, itemId = '', mode = '', after = '' }, context) => {
  const empty = { listings: [], next: '', mine: [], claims: [], scopeKey: '', revision: 0 };
  if (!isText(instanceCode) || !isText(marketCode) || !isText(playerId)) return empty;
  const { Listing, Claim } = models(context);
  const profile = await findProfile(marketCode, context, { scope: 1, revision: 1 });
  if (!profile) return empty;
  const scopeKey = await scopeKeyOf(profile.scope, instanceCode, context);
  if (!scopeKey) return { ...empty, revision: profile.revision };
  const market = { marketCode, scope: profile.scope, scopeKey };
  await settleDue(market, context);
  await settleDue({ $or: [{ seller: playerId }, { bidder: playerId }] }, context);
  const page = await Listing.find({
    ...market,
    status: 'open',
    endsAt: { $gt: new Date() },
    ...(isText(itemId) && { itemId }),
    ...(MARKET_MODES.includes(mode) && { mode }),
    ...afterCursor(after),
  })
    .sort({ endsAt: 1, _id: 1 })
    .limit(MARKET_PAGE + 1)
    .lean();
  const mine = await Listing.find({ ...market, seller: playerId, status: 'open' })
    .sort({ endsAt: 1 })
    .limit(MARKET_PAGE)
    .lean();
  const claims = await Claim.find({ player: playerId, status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(MARKET_PAGE)
    .lean();
  const listings = page.slice(0, MARKET_PAGE);
  return {
    listings: listings.map((listing) => wireListing(listing, playerId)),
    next: page.length > MARKET_PAGE ? cursorOf(listings.at(-1)) : '',
    mine: mine.map((listing) => wireListing(listing, playerId)),
    claims: claims.map(({ claimId, reason, coins, itemId: id, olCid, quantity, marketCode: from }) => ({
      claimId,
      reason,
      coins,
      marketCode: from,
      ...(quantity > 0 && { stack: { itemId: id, olCid, quantity, slot: 0, active: false } }),
    })),
    scopeKey,
    revision: profile.revision,
  };
};

export { MARKET_KINDS, MARKET_REFUSALS, applyMarketOp, listMarket, marketOpDefect, settleEnded, settleListing };
