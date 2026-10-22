/**
 * Market profiles: the shared contract of a market, the market a terminal opens, and the defects
 * that keep a terminal from opening it.
 *
 * A market is one profile in one scope key: the instance code of the terminal world for an
 * `instance` market, the universe code of that world for a `universe` market. The authority is the
 * deployment that serves the profile and keeps the listings, so its reference is
 * `authorityId/scope:scopeKey/code`. A code never reaches another deployment.
 *
 * @module src/projects/cyberia/economy/market-profile.js
 * @namespace CyberiaMarketProfile
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { CONTENT_CODE_PATTERN } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import {
  MARKET_MODES,
  MARKET_SELECTIONS,
  resolveMarketProfile,
} from '../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { universeCodeOf } from '../../../api/cyberia-universe/cyberia-universe.service.js';
import { confEconomyCode, economyAuthorityId, walletContract } from './economy-policy.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

const model = (name, options) => DataBaseProviderService.getModel(name, options);

/**
 * The shared rules of a profile for a write. Throws 400 on a defect.
 * @param {Object} market - `{code, ...rules}`.
 * @returns {Object} The resolved rules.
 * @memberof CyberiaMarketProfile
 */
export function assertMarketProfile(market) {
  if (!CONTENT_CODE_PATTERN.test(String(market?.code ?? ''))) throw httpError(400, 'The market code is invalid');
  try {
    return resolveMarketProfile(market);
  } catch (error) {
    throw httpError(400, error.message);
  }
}

/**
 * The scope key of the market a terminal of a world opens: the world itself, or its universe.
 * '' for a universe market in a world that belongs to no universe.
 * @param {string} scope
 * @param {string} instanceCode
 * @param {{host: string, path: string}|string} options
 * @returns {Promise<string>}
 * @memberof CyberiaMarketProfile
 */
export const scopeKeyOf = async (scope, instanceCode, options) =>
  scope === 'universe' ? await universeCodeOf(instanceCode, options) : instanceCode;

/**
 * The reference of one market of this authority.
 * @param {{scope: string, scopeKey: string, code: string}} market
 * @returns {string}
 * @memberof CyberiaMarketProfile
 */
export const marketRef = ({ scope, scopeKey, code }) => {
  const local = `${scope}:${scopeKey}/${code}`;
  return economyAuthorityId() ? `${economyAuthorityId()}/${local}` : local;
};

const TERMINAL_FIELDS = Object.freeze(['marketCode', 'selection', 'itemIds', 'listingModes']);

const namesEachOnce = (values, valid) =>
  Array.isArray(values) && values.every(valid) && new Set(values).size === values.length;

/**
 * The `market` capability of an action with every field, once it names an existing profile or
 * none. `itemIds` apply only to the selection `items`. Throws 400 on a defect.
 * @param {Object|undefined} terminal - `CyberiaAction.market`.
 * @param {{host: string, path: string}|string} options
 * @returns {Promise<Object|undefined>} The terminal to store; undefined when the action names none.
 * @memberof CyberiaMarketProfile
 */
export async function assertTerminal(terminal, options) {
  if (terminal === undefined || terminal === null) return undefined;
  const unknown = Object.keys(terminal).filter((key) => !TERMINAL_FIELDS.includes(key) && key !== '_id');
  if (unknown.length > 0) throw httpError(400, `Unknown market fields: ${unknown.join(', ')}`);
  const { marketCode = '', selection = 'policy', itemIds = [], listingModes = [...MARKET_MODES] } = terminal;
  if (marketCode && !CONTENT_CODE_PATTERN.test(marketCode)) throw httpError(400, 'The market code is invalid');
  if (!MARKET_SELECTIONS.includes(selection)) throw httpError(400, 'The market selection is invalid');
  if (!namesEachOnce(itemIds, (id) => typeof id === 'string' && id.length > 0))
    throw httpError(400, 'The market items must name each item once');
  if (selection === 'policy' && itemIds.length > 0)
    throw httpError(400, 'The market items apply only to the selection items');
  if (!namesEachOnce(listingModes, (mode) => MARKET_MODES.includes(mode)))
    throw httpError(400, 'The listing modes must name each mode once');
  if (marketCode && !(await model('CyberiaMarket', options).exists({ code: marketCode })))
    throw httpError(400, `No market profile has the code ${marketCode}`);
  return { marketCode, selection, itemIds, listingModes };
}

/**
 * The modes a seller lists in at a terminal: the modes the market supports that the terminal offers.
 * @param {{listingModes?: string[]}} terminal - `CyberiaAction.market`.
 * @param {{modes: string[]}} profile
 * @returns {string[]}
 * @memberof CyberiaMarketProfile
 */
export const terminalListingModes = (terminal, profile) =>
  profile.modes.filter((mode) => (terminal?.listingModes ?? []).includes(mode));

/** The wallet currency of a world: the currency of the economy its conf names. */
const walletCurrencyOf = async (instanceCode, options) => {
  const conf = await model('CyberiaInstanceConf', options).findOne({ instanceCode }).lean();
  const economy = await model('CyberiaEconomy', options)
    .findOne({ code: confEconomyCode(conf) }, { currency: 1 })
    .lean();
  return economy ? walletContract(economy).code : '';
};

/**
 * Why a terminal of a world cannot open a market, or ''. A retired market still opens: its
 * listings run to their end and its claims stay collectible; it only takes no new listing.
 * @param {Object|null} profile - The stored profile, or null for an unknown code.
 * @param {{scopeKey: string, walletCurrency: string}} world
 * @returns {string}
 * @memberof CyberiaMarketProfile
 */
export const marketDefect = (profile, { scopeKey, walletCurrency }) => {
  if (!profile) return 'no market profile has this code';
  if (!scopeKey) return 'the world belongs to no universe';
  if (walletCurrency !== profile.currencyCode)
    return `the world pays in ${walletCurrency || 'no currency'}, the market trades in ${profile.currencyCode}`;
  return '';
};

/**
 * The markets the terminals of a world open, as the world payload carries them: each profile with
 * the scope key of this world and its defect. A terminal with a defect lists nothing.
 * @param {string} instanceCode
 * @param {Object[]} actions - Lean `CyberiaAction` documents of the world.
 * @param {{host: string, path: string}|string} options
 * @returns {Promise<Object[]>} Wire `MarketProfile` list, by code.
 * @memberof CyberiaMarketProfile
 */
export async function worldMarkets(instanceCode, actions, options) {
  const codes = [...new Set(actions.map((action) => action.market?.marketCode).filter(Boolean))].sort();
  if (codes.length === 0) return [];
  const profiles = new Map(
    (
      await model('CyberiaMarket', options)
        .find({ code: { $in: codes } })
        .lean()
    ).map((profile) => [profile.code, profile]),
  );
  const walletCurrency = await walletCurrencyOf(instanceCode, options);
  const out = [];
  for (const code of codes) {
    const profile = profiles.get(code) ?? null;
    const scopeKey = profile ? await scopeKeyOf(profile.scope, instanceCode, options) : '';
    const defect = marketDefect(profile, { scopeKey, walletCurrency });
    out.push(profile ? wireProfile(profile, scopeKey, defect) : { code, defect });
  }
  return out;
}

/** The wire `MarketProfile` of a stored profile in one scope key. */
const wireProfile = (profile, scopeKey, defect) => ({
  code: profile.code,
  revision: profile.revision,
  status: profile.status,
  scope: profile.scope,
  scopeKey,
  ref: marketRef({ ...profile, scopeKey }),
  currencyCode: profile.currencyCode,
  modes: profile.modes,
  hours: profile.hours,
  raisePercent: profile.auction.raisePercent,
  minRaise: profile.auction.minRaise,
  listingFee: profile.fees.listing,
  saleFee: profile.fees.sale,
  priceMin: profile.limits.priceMin,
  priceMax: profile.limits.priceMax,
  listingsPerPlayer: profile.limits.listingsPerPlayer,
  defect,
});

/**
 * Everything that names a profile: each terminal with its worlds, and each market it resolves to
 * with its live counts and the defects of its worlds. Listings and claims are read, never written.
 * @param {Object} profile - Lean `CyberiaMarket`.
 * @param {{host: string, path: string}|string} options
 * @returns {Promise<{terminals: Object[], markets: Object[], defects: string[]}>}
 * @memberof CyberiaMarketProfile
 */
export async function marketReferences(profile, options) {
  const actions = await model('CyberiaAction', options)
    .find({ 'market.marketCode': profile.code }, { code: 1, label: 1, sourceMapCode: 1, market: 1 })
    .sort({ code: 1 })
    .lean();
  const instances = await model('CyberiaInstance', options)
    .find(
      { cyberiaMapCodes: { $in: [...new Set(actions.map(({ sourceMapCode }) => sourceMapCode))] } },
      { code: 1, cyberiaMapCodes: 1 },
    )
    .lean();
  const markets = new Map();
  const defects = [];
  const terminals = [];
  for (const action of actions) {
    const worlds = instances
      .filter(({ cyberiaMapCodes }) => cyberiaMapCodes.includes(action.sourceMapCode))
      .map(({ code }) => code);
    if (worlds.length === 0) defects.push(`terminal ${action.code}: map ${action.sourceMapCode} is in no world`);
    for (const instanceCode of worlds) {
      const scopeKey = await scopeKeyOf(profile.scope, instanceCode, options);
      const defect = marketDefect(profile, { scopeKey, walletCurrency: await walletCurrencyOf(instanceCode, options) });
      if (defect) defects.push(`terminal ${action.code} in ${instanceCode}: ${defect}`);
      if (!scopeKey) continue;
      const ref = marketRef({ ...profile, scopeKey });
      const market = markets.get(ref) ?? { ref, scope: profile.scope, scopeKey, worlds: [], terminals: [] };
      if (!market.worlds.includes(instanceCode)) market.worlds.push(instanceCode);
      if (!market.terminals.includes(action.code)) market.terminals.push(action.code);
      markets.set(ref, market);
    }
    terminals.push({
      code: action.code,
      label: action.label ?? '',
      sourceMapCode: action.sourceMapCode,
      worlds,
      selection: action.market.selection,
      itemIds: action.market.itemIds ?? [],
      listingModes: terminalListingModes(action.market, profile),
    });
  }
  const Listing = model('CyberiaMarketListing', options);
  const Claim = model('CyberiaMarketClaim', options);
  const now = new Date();
  for (const market of markets.values()) {
    const key = { marketCode: profile.code, scope: profile.scope, scopeKey: market.scopeKey };
    market.open = await Listing.countDocuments({ ...key, status: 'open', endsAt: { $gt: now } });
    market.auctions = await Listing.countDocuments({ ...key, status: 'open', endsAt: { $gt: now }, mode: 'auction' });
    market.unsettled = await Listing.countDocuments({ ...key, status: 'open', endsAt: { $lte: now } });
    market.pendingClaims = await Claim.countDocuments({ ...key, status: 'pending' });
  }
  return { terminals, markets: [...markets.values()], defects };
}
