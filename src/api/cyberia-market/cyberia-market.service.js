/**
 * @module src/api/cyberia-market/cyberia-market.service.js
 *
 * Market profiles: the shared contract of each market. A write raises the revision, and the next
 * reload of each world takes it. A listing keeps the terms it was listed under. A profile changes
 * scope or currency only while no listing or claim holds goods under it, and goes only when nothing
 * names it.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { MARKET_CONTRACT } from '../cyberia-server-defaults/cyberia-server-defaults.js';
import { assertMarketProfile, marketReferences } from '../../projects/cyberia/economy/market-profile.js';
import { reloadContentServers } from '../../projects/cyberia/content/content-release.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

const model = (name, options) => DataBaseProviderService.getModel(name, options);

const findProfile = async (code, options) => {
  const profile = await model('CyberiaMarket', options).findOne(DataQuery.naturalKeyFilter('code', code)).lean();
  if (!profile) throw httpError(404, 'market not found');
  return profile;
};

/** The listings and the pending claims that hold goods under a market code. */
const heldGoods = async (code, options) => ({
  listings: await model('CyberiaMarketListing', options).countDocuments({ marketCode: code, status: 'open' }),
  claims: await model('CyberiaMarketClaim', options).countDocuments({ marketCode: code, status: 'pending' }),
});

class CyberiaMarketService {
  /** The fields, bounds and defaults of a profile and of a terminal. */
  static contract = async () => MARKET_CONTRACT;

  static post = async (req, res, options) => {
    const { code, name = '', description = '', status = 'active' } = req.body ?? {};
    const profile = assertMarketProfile(req.body ?? {});
    if (await model('CyberiaMarket', options).exists({ code })) throw httpError(409, `Market ${code} exists`);
    return await model('CyberiaMarket', options).create({ code, name, description, status, ...profile });
  };

  static get = async (req, res, options) => {
    const Market = model('CyberiaMarket', options);
    if (req.params.id) return await Market.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).lean();
    return await DataQuery.findPage(Market, req.query);
  };

  /** The editor view of one profile: the goods it holds, the terminals that name it and the markets they open. */
  static view = async (req, res, options) => {
    const market = await findProfile(req.params.id, options);
    return { market, held: await heldGoods(market.code, options), ...(await marketReferences(market, options)) };
  };

  /** Asks the running servers of the worlds whose terminals open a profile to reload, so they take its terms. */
  static reload = async (req, res, options) => {
    const market = await findProfile(req.params.id, options);
    const { markets } = await marketReferences(market, options);
    const worlds = [...new Set(markets.flatMap((entry) => entry.worlds))].sort();
    const endpoints = [];
    for (const instanceCode of worlds)
      endpoints.push(...(await reloadContentServers(options, { mode: 'full', instanceCode })));
    return { worlds, endpoints };
  };

  /** A new profile with the rules of another one; it holds no listing. */
  static clone = async (req, res, options) => {
    const source = await findProfile(req.params.id, options);
    const { code, name = '' } = req.body ?? {};
    const profile = assertMarketProfile({ ...source, code });
    if (await model('CyberiaMarket', options).exists({ code })) throw httpError(409, `Market ${code} exists`);
    return (
      await model('CyberiaMarket', options).create({ code, name, description: source.description ?? '', ...profile })
    ).toObject();
  };

  /** The body names the revision it read; the code never changes. */
  static put = async (req, res, options) => {
    const stored = await findProfile(req.params.id, options);
    const body = req.body ?? {};
    if (body.code !== undefined && body.code !== stored.code)
      throw httpError(400, `The code of market ${stored.code} never changes`);
    if (body.revision !== stored.revision)
      throw httpError(409, `Market ${stored.code} is at revision ${stored.revision}, not ${body.revision}: reload it`);
    const next = { ...stored, ...body, code: stored.code };
    const profile = assertMarketProfile(next);
    if (profile.scope !== stored.scope || profile.currencyCode !== stored.currencyCode) {
      const held = await heldGoods(stored.code, options);
      if (held.listings + held.claims > 0)
        throw httpError(
          409,
          `Market ${stored.code} holds ${held.listings} open listings and ${held.claims} pending claims: its scope and currency stay until they end`,
        );
    }
    const updated = await model('CyberiaMarket', options)
      .findOneAndUpdate(
        { _id: stored._id, revision: stored.revision },
        {
          $set: { name: next.name ?? '', description: next.description ?? '', status: next.status, ...profile },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();
    if (!updated) throw httpError(409, `Market ${stored.code} changed while saving: reload it`);
    return updated;
  };

  /** A profile no terminal names and no listing or claim holds goods under. */
  static delete = async (req, res, options) => {
    if (!req.params.id) throw httpError(400, 'Name the market to delete');
    const stored = await findProfile(req.params.id, options);
    const terminals = await model('CyberiaAction', options).distinct('code', { 'market.marketCode': stored.code });
    if (terminals.length > 0) throw httpError(409, `Terminals ${terminals.join(', ')} open market ${stored.code}`);
    const held = await heldGoods(stored.code, options);
    if (held.listings + held.claims > 0)
      throw httpError(
        409,
        `Market ${stored.code} holds ${held.listings} open listings and ${held.claims} pending claims`,
      );
    await model('CyberiaMarket', options).deleteOne({ _id: stored._id });
    return stored;
  };
}

export { CyberiaMarketService };
