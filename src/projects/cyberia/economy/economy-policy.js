/**
 * Economy policy of the Cyberia runtime: the snapshot a world runs, the profile checks the writers
 * share, and the wallet rule of a universe.
 *
 * A `CyberiaEconomy` profile holds the coin model, the currency, the operation fees and the item
 * policy defaults; `CyberiaEconomicItemPolicy` rows override the defaults per item. The snapshot
 * compiles each row against the catalog binding of its item, so a server checks that a stack runs
 * the definition the policy was compiled for. Both boot transports send the snapshot as the
 * `EconomyRules` message of the instance config.
 *
 * An economy code is local to this deployment. The snapshot names it with the authority that owns
 * it, `{authorityId, code, revision}`: two deployments can each run a `standard` that shares nothing.
 *
 * @module src/projects/cyberia/economy/economy-policy.js
 * @namespace CyberiaEconomyPolicy
 */
import { CONTENT_CODE_PATTERN } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import {
  CURRENCY_DEFAULTS,
  ECONOMY_DEFAULT_CODE,
  ECONOMY_RULES_DEFAULTS,
  ITEM_POLICY_DEFAULTS,
  ITEM_POLICY_OPTIONAL_LIMITS,
  OPERATION_FEE_DEFAULTS,
  effectiveItemPolicy,
  itemPolicyDefect,
  resolveCurrency,
  resolveEconomyProfile,
} from '../../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { loggerFactory } from '../../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * The authority that owns the economies, wallets and markets this engine serves: its deploy id.
 * @memberof CyberiaEconomyPolicy
 */
export const economyAuthorityId = () => process.env.DEPLOY_ID ?? '';

/**
 * The wallet contract of a profile: what every world that shares a profile wallet holds the same way.
 * @param {Object} economy - A `CyberiaEconomy` or its pending fields.
 * @returns {{code: string, maxBalance: number}}
 * @memberof CyberiaEconomyPolicy
 */
export const walletContract = (economy) => resolveCurrency(economy?.currency ?? {});

/** The policy fields of a wire `ItemPolicy`; an optional field is sent only when set. */
const wirePolicy = ({ itemId = '', olCid = '', salvage = [], ...policy }) => ({
  itemId,
  olCid,
  ...Object.fromEntries(Object.keys(ITEM_POLICY_DEFAULTS).map((key) => [key, policy[key]])),
  ...Object.fromEntries(
    Object.keys(ITEM_POLICY_OPTIONAL_LIMITS)
      .filter((key) => policy[key] !== undefined && policy[key] !== null)
      .map((key) => [key, policy[key]]),
  ),
  salvage: salvage.map(({ itemId: id, qty }) => ({ itemId: id, qty })),
});

/**
 * The wire `EconomyRules` of a profile and its compiled item policies.
 * @param {Object} profile - Resolved profile fields and `authorityId`, `code`, `revision`.
 * @param {Object[]} itemPolicies - Effective policies with `itemId` and `olCid`.
 * @memberof CyberiaEconomyPolicy
 */
const economyMessage = ({ authorityId, code, revision, currency, rules, fees, itemDefaults }, itemPolicies) => ({
  authorityId,
  code,
  revision,
  ...rules,
  maxBalance: currency.maxBalance,
  fees,
  itemDefaults: wirePolicy(itemDefaults),
  itemPolicies: itemPolicies.map(wirePolicy),
});

/**
 * The economy of a world without content: the defaults, no authority, no profile and no item rows.
 * @memberof CyberiaEconomyPolicy
 */
export const defaultEconomySnapshot = () =>
  economyMessage(
    {
      authorityId: '',
      code: '',
      revision: 0,
      currency: CURRENCY_DEFAULTS,
      rules: ECONOMY_RULES_DEFAULTS,
      fees: OPERATION_FEE_DEFAULTS,
      itemDefaults: ITEM_POLICY_DEFAULTS,
    },
    [],
  );

/**
 * The active profile of a code, as a lean document.
 * @param {Object} models - Content models with `CyberiaEconomy`.
 * @param {string} code
 * @throws {Error} 404 for an unknown code, 409 for a retired profile.
 * @memberof CyberiaEconomyPolicy
 */
export async function activeEconomy(models, code) {
  const economy = await models.CyberiaEconomy.findOne({ code }).lean();
  if (!economy) throw httpError(404, `No economy ${code}`);
  if (economy.status !== 'active') throw httpError(409, `Economy ${code} is retired`);
  return economy;
}

/**
 * Compiles the snapshot a world runs: the active profile and every item row, each one resolved
 * over the profile defaults and stamped with the definition its item is bound to now. A row of an
 * unbound item names no definition a stack can hold: it stays out, with a warning.
 * @param {Object} models - Content models with `CyberiaEconomy`, `CyberiaEconomicItemPolicy`, `CyberiaItemCatalog`.
 * @param {string} code
 * @returns {Promise<Object>} The wire `EconomyRules`.
 * @memberof CyberiaEconomyPolicy
 */
export async function compileEconomySnapshot(models, code) {
  const economy = await activeEconomy(models, code);
  const profile = resolveEconomyProfile(economy);
  const rows = await models.CyberiaEconomicItemPolicy.find({ economyCode: code }).sort({ itemId: 1 }).lean();
  const bindings = await models.CyberiaItemCatalog.resolve(rows.map(({ itemId }) => itemId));
  const unbound = rows.filter(({ itemId }) => !bindings.has(itemId)).map(({ itemId }) => itemId);
  if (unbound.length > 0) logger.warn(`Economy ${code}: no binding for the policies of ${unbound.join(', ')}`);
  return economyMessage(
    { authorityId: economyAuthorityId(), code, revision: economy.revision, ...profile },
    rows
      .filter(({ itemId }) => bindings.has(itemId))
      .map((row) => ({
        itemId: row.itemId,
        olCid: bindings.get(row.itemId),
        ...effectiveItemPolicy(row, profile.itemDefaults),
      })),
  );
}

/**
 * The economy code a stored conf names: its own, else the default profile.
 * @param {Object} conf - Lean `CyberiaInstanceConf`.
 * @returns {string}
 * @memberof CyberiaEconomyPolicy
 */
export const confEconomyCode = (conf) => conf?.economyCode || ECONOMY_DEFAULT_CODE;

/**
 * The first defect of the wallets of a universe: two members whose economies hold coins differently.
 * A universe profile carries one wallet between its worlds, so every member runs one currency with
 * one maximum. Their other rules, fees and item policies may differ.
 * @param {Object} models - Content models with `CyberiaInstanceConf` and `CyberiaEconomy`.
 * @param {string[]} instanceCodes - The members.
 * @param {{confs?: Object<string,string>, economies?: Object<string,Object>}} [planned={}] - The
 *   economy code a pending conf write gives a member, and the currency a pending profile write gives
 *   an economy.
 * @returns {Promise<string>}
 * @memberof CyberiaEconomyPolicy
 */
export async function universeWalletDefect(models, instanceCodes, { confs = {}, economies = {} } = {}) {
  if (instanceCodes.length < 2) return '';
  const stored = await models.CyberiaInstanceConf.find(
    { instanceCode: { $in: instanceCodes } },
    { instanceCode: 1, economyCode: 1 },
  ).lean();
  const codeOf = new Map(stored.map((conf) => [conf.instanceCode, confEconomyCode(conf)]));
  const members = instanceCodes.map((instanceCode) => ({
    instanceCode,
    economyCode: confs[instanceCode] ?? codeOf.get(instanceCode) ?? ECONOMY_DEFAULT_CODE,
  }));
  const profiles = new Map(
    (
      await models.CyberiaEconomy.find(
        { code: { $in: [...new Set(members.map(({ economyCode }) => economyCode))] } },
        { code: 1, currency: 1 },
      ).lean()
    ).map((economy) => [economy.code, economy]),
  );
  const walletOf = (code) =>
    economies[code] ? resolveCurrency(economies[code]) : profiles.has(code) ? walletContract(profiles.get(code)) : null;
  const named = ({ instanceCode, economyCode }, wallet) =>
    `${instanceCode} (${economyCode}: ${wallet.code} up to ${wallet.maxBalance})`;
  let first = null;
  for (const member of members) {
    const wallet = walletOf(member.economyCode);
    if (!wallet) return `world ${member.instanceCode} names economy ${member.economyCode}, which is not stored`;
    if (!first) first = { member, wallet };
    else if (wallet.code !== first.wallet.code || wallet.maxBalance !== first.wallet.maxBalance)
      return `worlds ${named(first.member, first.wallet)} and ${named(member, wallet)} hold different wallets`;
  }
  return '';
}

/**
 * Checks one item policy row against its economy and the catalog.
 * @param {Object} models - Content models with `CyberiaEconomy`, `CyberiaItemCatalog`.
 * @param {Object} row
 * @throws {Error} 400 on a defect, 404 for an unknown economy or an unbound item.
 * @memberof CyberiaEconomyPolicy
 */
export async function assertItemPolicy(models, row) {
  const defect = itemPolicyDefect(row);
  if (defect) throw httpError(400, `Invalid item policy: ${defect}`);
  if (!(await models.CyberiaEconomy.exists({ code: row.economyCode })))
    throw httpError(404, `No economy ${row.economyCode}`);
  const items = [row.itemId, ...(row.salvage ?? []).map(({ itemId }) => itemId)];
  const bindings = await models.CyberiaItemCatalog.resolve(items);
  const unbound = items.filter((itemId) => !bindings.has(itemId));
  if (unbound.length > 0) throw httpError(404, `The catalog binds no ${unbound.join(', ')}`);
}

/**
 * Checks the code and the profile fields of an economy.
 * @param {Object} economy
 * @returns {Object} The resolved profile fields.
 * @throws {Error} 400 on a defect.
 * @memberof CyberiaEconomyPolicy
 */
export function assertEconomyProfile(economy) {
  if (!CONTENT_CODE_PATTERN.test(String(economy?.code ?? ''))) throw httpError(400, 'The economy code is invalid');
  try {
    return resolveEconomyProfile(economy);
  } catch (error) {
    throw httpError(400, error.message);
  }
}

/**
 * Writes an economy and its item rows in one transaction: the profile by code, and the rows
 * replaced whole. The revision rises when the profile existed. An import uses it.
 * @param {Object} models - Content models with `CyberiaEconomy`, `CyberiaEconomicItemPolicy`.
 * @param {{code: string, items?: Object[]}} economy - A runtime economy document with its rows.
 * @memberof CyberiaEconomyPolicy
 */
export async function replaceEconomy(models, { items = [], ...economy }) {
  const profile = assertEconomyProfile(economy);
  for (const row of items) {
    const defect = itemPolicyDefect(row);
    if (defect) throw httpError(400, `Invalid item policy: ${defect}`);
  }
  const { code, name = '', description = '', status = 'active' } = economy;
  const session = await models.CyberiaEconomy.db.startSession();
  try {
    await session.withTransaction(async () => {
      const stored = await models.CyberiaEconomy.findOne({ code }, { revision: 1 }, { session }).lean();
      await models.CyberiaEconomy.updateOne(
        { code },
        {
          $set: { name, description, status, ...profile, revision: stored ? stored.revision + 1 : 1 },
        },
        { upsert: true, session, runValidators: true },
      );
      await models.CyberiaEconomicItemPolicy.deleteMany({ economyCode: code }, { session });
      if (items.length > 0)
        await models.CyberiaEconomicItemPolicy.insertMany(
          items.map((row) => ({ ...row, economyCode: code })),
          { session },
        );
    });
  } finally {
    await session.endSession();
  }
}

/**
 * The runtime document of an economy with its item rows, as an export writes it.
 * @param {Object} models - Content models with `CyberiaEconomy`, `CyberiaEconomicItemPolicy`.
 * @param {string} code
 * @returns {Promise<Object|null>}
 * @memberof CyberiaEconomyPolicy
 */
export async function readEconomy(models, code) {
  const economy = await models.CyberiaEconomy.findOne(
    { code },
    { _id: 0, code: 1, name: 1, description: 1, status: 1, currency: 1, rules: 1, fees: 1, itemDefaults: 1 },
  ).lean();
  if (!economy) return null;
  const items = await models.CyberiaEconomicItemPolicy.find(
    { economyCode: code },
    { _id: 0, economyCode: 0, createdAt: 0, updatedAt: 0, __v: 0 },
  )
    .sort({ itemId: 1 })
    .lean();
  return { ...economy, items };
}
