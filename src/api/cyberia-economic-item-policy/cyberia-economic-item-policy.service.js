/**
 * @module src/api/cyberia-economic-item-policy/cyberia-economic-item-policy.service.js
 *
 * Item policies: one row per economy and item. A write checks the row against its economy and
 * the catalog, and raises the economy revision in the same transaction.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { ITEM_POLICY_ROW_FIELDS, effectiveItemPolicy } from '../cyberia-server-defaults/cyberia-server-defaults.js';
import { assertItemPolicy } from '../../projects/cyberia/economy/economy-policy.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

const model = (name, options) => DataBaseProviderService.getModel(name, options);

/** The row a body describes: its keys and only the policy fields it sets. */
const rowOf = (body = {}) => ({
  economyCode: body.economyCode,
  itemId: body.itemId,
  ...Object.fromEntries(ITEM_POLICY_ROW_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])),
});

const contentModels = (options) => ({
  CyberiaEconomy: model('CyberiaEconomy', options),
  CyberiaItemCatalog: model('CyberiaItemCatalog', options),
});

/** Runs a write and the revision rise of its economy in one transaction. */
const withRevision = async (economyCode, options, write) => {
  const Policy = model('CyberiaEconomicItemPolicy', options);
  const session = await Policy.db.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await write(Policy, session);
      await model('CyberiaEconomy', options).updateOne({ code: economyCode }, { $inc: { revision: 1 } }, { session });
    });
    return result;
  } finally {
    await session.endSession();
  }
};

class CyberiaEconomicItemPolicyService {
  /** Creates or replaces the row of `{economyCode, itemId}`: a field the body leaves out inherits. */
  static post = async (req, res, options) => {
    const row = rowOf(req.body);
    await assertItemPolicy(contentModels(options), row);
    return await withRevision(row.economyCode, options, async (Policy, session) => {
      await Policy.replaceOne({ economyCode: row.economyCode, itemId: row.itemId }, row, {
        upsert: true,
        session,
        runValidators: true,
      });
      return await Policy.findOne({ economyCode: row.economyCode, itemId: row.itemId }, null, { session }).lean();
    });
  };

  /** `?economyCode=` lists the rows of one economy. */
  static get = async (req, res, options) => {
    const Policy = model('CyberiaEconomicItemPolicy', options);
    if (req.params.id) return await Policy.findById(req.params.id).lean();
    const { economyCode, ...query } = req.query ?? {};
    if (!economyCode) return await DataQuery.findPage(Policy, query);
    return await DataQuery.findPage(Policy, { ...query, query: { economyCode: String(economyCode) } });
  };

  /**
   * A page of the rows of one economy. Each row carries the definition the catalog binds to its
   * item ('' when none) and the policy it runs.
   */
  static view = async (req, res, options) => {
    const { economyCode, ...query } = req.query ?? {};
    const economy = await model('CyberiaEconomy', options)
      .findOne({ code: String(economyCode ?? '') })
      .lean();
    if (!economy) throw httpError(404, 'economy not found');
    const page = await DataQuery.findPage(model('CyberiaEconomicItemPolicy', options), {
      ...query,
      query: { economyCode: economy.code },
    });
    const bindings = await model('CyberiaItemCatalog', options).resolve(page.data.map((row) => row.itemId));
    return {
      ...page,
      data: page.data.map((row) => ({
        ...row,
        objectLayerCid: bindings.get(row.itemId) ?? '',
        effective: effectiveItemPolicy(row, economy.itemDefaults),
      })),
    };
  };

  /** Replaces one row by id; its economy and item never change. */
  static put = async (req, res, options) => {
    const Policy = model('CyberiaEconomicItemPolicy', options);
    const stored = await Policy.findById(req.params.id).lean();
    if (!stored) throw httpError(404, 'item policy not found');
    const row = rowOf({ ...req.body, economyCode: stored.economyCode, itemId: stored.itemId });
    await assertItemPolicy(contentModels(options), row);
    return await withRevision(stored.economyCode, options, async (Policy, session) => {
      await Policy.replaceOne({ _id: stored._id }, row, { session, runValidators: true });
      return await Policy.findById(stored._id, null, { session }).lean();
    });
  };

  static delete = async (req, res, options) => {
    if (!req.params.id) throw httpError(400, 'Name the item policy to delete');
    const stored = await model('CyberiaEconomicItemPolicy', options).findById(req.params.id).lean();
    if (!stored) throw httpError(404, 'item policy not found');
    await withRevision(stored.economyCode, options, (Policy, session) =>
      Policy.deleteOne({ _id: stored._id }, { session }),
    );
    return stored;
  };
}

export { CyberiaEconomicItemPolicyService };
