/**
 * @module src/api/cyberia-economy/cyberia-economy.service.js
 *
 * Economy profiles: the coin model, the currency, the operation fees and the item policy defaults
 * that the worlds naming them run. A write raises the revision, and the next reload of each world
 * takes it. A currency change that would split the wallet of a universe is refused.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import {
  assertEconomyProfile,
  universeWalletDefect,
  walletContract,
} from '../../projects/cyberia/economy/economy-policy.js';
import { ECONOMY_CONTRACT } from '../cyberia-server-defaults/cyberia-server-defaults.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

const model = (name, options) => DataBaseProviderService.getModel(name, options);

/** The instance codes whose confs name an economy. */
const namedBy = async (code, options) =>
  await model('CyberiaInstanceConf', options).distinct('instanceCode', { economyCode: code });

/** The models a wallet check reads. */
const walletModels = (options) => ({
  CyberiaInstanceConf: model('CyberiaInstanceConf', options),
  CyberiaEconomy: model('CyberiaEconomy', options),
});

/** The first universe whose shared wallet a new currency of economy `code` would split, or ''. */
const walletChangeDefect = async (code, currency, options) => {
  const worlds = await namedBy(code, options);
  if (worlds.length === 0) return '';
  const models = walletModels(options);
  const universes = await model('CyberiaUniverse', options)
    .find({ 'instances.instanceCode': { $in: worlds } }, { code: 1, instances: 1 })
    .lean();
  for (const universe of universes) {
    const members = universe.instances.map(({ instanceCode }) => instanceCode);
    const defect = await universeWalletDefect(models, members, { economies: { [code]: currency } });
    if (defect) return `universe ${universe.code}: ${defect}`;
  }
  return '';
};

class CyberiaEconomyService {
  /** The fields, bounds and defaults of a profile and of an item row. */
  static contract = async () => ECONOMY_CONTRACT;

  static post = async (req, res, options) => {
    const { code, name = '', description = '' } = req.body ?? {};
    const profile = assertEconomyProfile(req.body ?? {});
    if (await model('CyberiaEconomy', options).exists({ code })) throw httpError(409, `Economy ${code} exists`);
    return await model('CyberiaEconomy', options).create({ code, name, description, ...profile });
  };

  static get = async (req, res, options) => {
    const Economy = model('CyberiaEconomy', options);
    if (req.params.id) return await Economy.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).lean();
    return await DataQuery.findPage(Economy, req.query);
  };

  /**
   * The editor view of one economy: the profile, the worlds whose confs name it, each universe they
   * belong to with the defect of its shared wallet ('' when compatible), and its item row count.
   */
  static view = async (req, res, options) => {
    const economy = await model('CyberiaEconomy', options)
      .findOne(DataQuery.naturalKeyFilter('code', req.params.id))
      .lean();
    if (!economy) throw httpError(404, 'economy not found');
    const worlds = await namedBy(economy.code, options);
    const models = walletModels(options);
    const universes = [];
    for (const universe of await model('CyberiaUniverse', options)
      .find({ 'instances.instanceCode': { $in: worlds } }, { code: 1, instances: 1 })
      .sort({ code: 1 })
      .lean()) {
      const members = universe.instances.map(({ instanceCode }) => instanceCode);
      universes.push({ code: universe.code, worlds: members, defect: await universeWalletDefect(models, members) });
    }
    const itemCount = await model('CyberiaEconomicItemPolicy', options).countDocuments({ economyCode: economy.code });
    return { economy, worlds, universes, itemCount };
  };

  /** A new profile with the fields and the item rows of another one, in one transaction. */
  static clone = async (req, res, options) => {
    const Economy = model('CyberiaEconomy', options);
    const source = await Economy.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).lean();
    if (!source) throw httpError(404, 'economy not found');
    const { code, name = '' } = req.body ?? {};
    const profile = assertEconomyProfile({ ...source, code });
    if (await Economy.exists({ code })) throw httpError(409, `Economy ${code} exists`);
    const Policy = model('CyberiaEconomicItemPolicy', options);
    const session = await Economy.db.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        [created] = await Economy.create([{ code, name, description: source.description ?? '', ...profile }], {
          session,
        });
        const rows = await Policy.find({ economyCode: source.code }, null, { session }).lean();
        if (rows.length > 0)
          await Policy.insertMany(
            rows.map(({ _id, createdAt, updatedAt, __v, ...row }) => ({ ...row, economyCode: code })),
            { session },
          );
      });
      return created.toObject();
    } finally {
      await session.endSession();
    }
  };

  /** The body names the revision it read; the code never changes; no conf may name a retired profile. */
  static put = async (req, res, options) => {
    const Economy = model('CyberiaEconomy', options);
    const stored = await Economy.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).lean();
    if (!stored) throw httpError(404, 'economy not found');
    const body = req.body ?? {};
    if (body.code !== undefined && body.code !== stored.code)
      throw httpError(400, `The code of economy ${stored.code} never changes`);
    if (body.revision !== stored.revision)
      throw httpError(409, `Economy ${stored.code} is at revision ${stored.revision}, not ${body.revision}: reload it`);
    const next = { ...stored, ...body, code: stored.code };
    const profile = assertEconomyProfile(next);
    const wallet = walletContract(stored);
    if (wallet.code !== profile.currency.code || wallet.maxBalance !== profile.currency.maxBalance) {
      const defect = await walletChangeDefect(stored.code, profile.currency, options);
      if (defect) throw httpError(409, `Universe wallet: ${defect}`);
    }
    if (next.status === 'retired' && stored.status !== 'retired') {
      const worlds = await namedBy(stored.code, options);
      if (worlds.length > 0) throw httpError(409, `Worlds ${worlds.join(', ')} run economy ${stored.code}`);
    }
    const updated = await Economy.findOneAndUpdate(
      { _id: stored._id, revision: stored.revision },
      {
        $set: { name: next.name ?? '', description: next.description ?? '', status: next.status, ...profile },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) throw httpError(409, `Economy ${stored.code} changed while saving: reload it`);
    return updated;
  };

  /** A profile no world names goes with its item rows. */
  static delete = async (req, res, options) => {
    if (!req.params.id) throw httpError(400, 'Name the economy to delete');
    const Economy = model('CyberiaEconomy', options);
    const stored = await Economy.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).lean();
    if (!stored) throw httpError(404, 'economy not found');
    const worlds = await namedBy(stored.code, options);
    if (worlds.length > 0) throw httpError(409, `Worlds ${worlds.join(', ')} run economy ${stored.code}`);
    const session = await Economy.db.startSession();
    try {
      await session.withTransaction(async () => {
        await model('CyberiaEconomicItemPolicy', options).deleteMany({ economyCode: stored.code }, { session });
        await Economy.deleteOne({ _id: stored._id }, { session });
      });
    } finally {
      await session.endSession();
    }
    return stored;
  };
}

export { CyberiaEconomyService };
