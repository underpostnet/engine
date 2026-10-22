/**
 * What the economy capabilities of a terminal do in each world of its map: for every buyback, burn
 * and market item, the permission of the action, the effective policy of the economy the world
 * runs, the catalog binding, the amount, and the reason it is blocked. The Studio shows it; nothing
 * here writes.
 *
 * @module src/projects/cyberia/economy/terminal-diagnostics.js
 * @namespace CyberiaTerminalDiagnostics
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  effectiveItemPolicy,
  resolveEconomyProfile,
} from '../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { confEconomyCode, economyAuthorityId } from './economy-policy.js';
import { terminalListingModes, worldMarkets } from './market-profile.js';

const model = (name, options) => DataBaseProviderService.getModel(name, options);

/** The item a capability offers, with the reason it is blocked in a world ('' when usable). */
const itemRow = ({ itemId, binding, policy, flag, amount, minimum, label, market }) => {
  const allowed = policy[flag] === true;
  const reason = !binding
    ? 'no catalog binding'
    : !allowed
      ? `the economy refuses ${label} of this item`
      : amount !== undefined && amount < minimum
        ? `the ${label} amount is ${amount}`
        : (market?.defect ?? '');
  return { itemId, olCid: binding ?? '', allowed, amount: amount ?? null, usable: !reason, reason };
};

/** A capability that lists items none of which is usable here. */
const warningOf = (label, rows) =>
  rows.length > 0 && rows.every(({ usable }) => !usable)
    ? `${label} names ${rows.length} item${rows.length === 1 ? '' : 's'} and none is usable here`
    : '';

/** The diagnostics of one world: its economy, its market and each capability. */
const worldDiagnostics = async (action, instanceCode, options) => {
  const conf = await model('CyberiaInstanceConf', options).findOne({ instanceCode }).lean();
  const economyCode = confEconomyCode(conf);
  const economy = await model('CyberiaEconomy', options).findOne({ code: economyCode }).lean();
  const [market] = await worldMarkets(instanceCode, [action], options);
  const out = {
    instanceCode,
    economy: { code: economyCode, revision: economy?.revision ?? 0, authorityId: economyAuthorityId(), defect: '' },
    market: market
      ? { ...market, listingModes: terminalListingModes(action.market, { modes: market.modes ?? [] }) }
      : null,
  };
  let profile;
  try {
    if (!economy) throw new Error(`no economy ${economyCode}`);
    if (economy.status !== 'active') throw new Error(`economy ${economyCode} is retired`);
    profile = resolveEconomyProfile(economy);
  } catch (error) {
    out.economy.defect = error.message;
    return out;
  }
  const rows = await model('CyberiaEconomicItemPolicy', options).find({ economyCode }).lean();
  const rowOf = new Map(rows.map((row) => [row.itemId, row]));
  const listed =
    action.market?.selection === 'policy'
      ? rows.filter((row) => effectiveItemPolicy(row, profile.itemDefaults).market).map(({ itemId }) => itemId)
      : (action.market?.itemIds ?? []);
  const ids = [...new Set([...(action.buybackItems ?? []), ...(action.burnItems ?? []), ...listed])];
  const bindings = await model('CyberiaItemCatalog', options).resolve(ids);
  const policyOf = (itemId) => effectiveItemPolicy(rowOf.get(itemId), profile.itemDefaults);
  const buyback = (action.buybackItems ?? []).map((itemId) =>
    itemRow({
      itemId,
      binding: bindings.get(itemId),
      policy: policyOf(itemId),
      flag: 'buyback',
      amount: policyOf(itemId).buybackPayout,
      minimum: 1,
      label: 'buyback',
    }),
  );
  const burn = (action.burnItems ?? []).map((itemId) => ({
    ...itemRow({
      itemId,
      binding: bindings.get(itemId),
      policy: policyOf(itemId),
      flag: 'burn',
      amount: policyOf(itemId).burnCoinFee,
      minimum: 0,
      label: 'burn',
    }),
    salvage: policyOf(itemId).salvage,
  }));
  // A retired market still sells what it holds, but takes no new listing.
  const listingBlock = market?.defect || (market && market.status !== 'active' ? 'the market is retired' : '');
  const marketRows = action.market?.marketCode
    ? listed.map((itemId) =>
        itemRow({
          itemId,
          binding: bindings.get(itemId),
          policy: policyOf(itemId),
          flag: 'market',
          label: 'market listing',
          market: { defect: listingBlock },
        }),
      )
    : [];
  out.capabilities = {
    buyback: { items: buyback, warning: warningOf('Buyback', buyback) },
    burn: { items: burn, warning: warningOf('Burn', burn) },
    market: {
      selection: action.market?.selection ?? 'policy',
      defaultsAllow: profile.itemDefaults.market === true,
      items: marketRows,
      warning: action.market?.marketCode
        ? listingBlock
          ? `No listing here: ${listingBlock}`
          : marketRows.length === 0 && !profile.itemDefaults.market
            ? 'No item may be listed here: the selection names none the economy allows'
            : warningOf('The market selection', marketRows)
        : '',
    },
  };
  return out;
};

/**
 * The diagnostics of a terminal in every world that holds its map.
 * @param {Object} action - Lean `CyberiaAction`.
 * @param {{host: string, path: string}|string} options
 * @returns {Promise<{action: {code: string, revision: number}, worlds: Object[], defects: string[]}>}
 * @memberof CyberiaTerminalDiagnostics
 */
export async function terminalDiagnostics(action, options) {
  const worlds = await model('CyberiaInstance', options)
    .find({ cyberiaMapCodes: action.sourceMapCode }, { code: 1 })
    .sort({ code: 1 })
    .lean();
  return {
    action: { code: action.code, revision: action.revision ?? 1 },
    worlds: await Promise.all(worlds.map(({ code }) => worldDiagnostics(action, code, options))),
    defects:
      worlds.length === 0 ? [`map ${action.sourceMapCode || '(none)'} is in no world: the terminal runs nowhere`] : [],
  };
}
