import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { revisionGuard } from '../../server/storage/revision.js';
import { assertTerminal } from '../../projects/cyberia/economy/market-profile.js';
import { terminalDiagnostics } from '../../projects/cyberia/economy/terminal-diagnostics.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

const logger = loggerFactory(import.meta);

class CyberiaActionService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    const { revision, market, ...fields } = req.body ?? {};
    const terminal = await assertTerminal(market, options);
    return await new CyberiaAction({ ...fields, ...(terminal && { market: terminal }) }).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    if (req.params.id) return await CyberiaAction.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaAction.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaAction.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static getByCode = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    const { code } = req.params;
    if (!code) throw new Error('code parameter is required');
    const data = await CyberiaAction.findOne({ code }).lean();
    if (data) return data;
    throw new Error(`No action found for code: ${code}`);
  };
  /** The body names the revision it read; a field it leaves out stays as stored. */
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    const stored = await CyberiaAction.findById(req.params.id);
    if (!stored) throw httpError(404, 'action not found');
    const { _id, revision, createdAt, updatedAt, __v, ...changes } = req.body ?? {};
    if (revision !== stored.revision)
      throw httpError(409, `Action ${stored.code} is at revision ${stored.revision}, not ${revision}: reload it`);
    if (changes.market) changes.market = await assertTerminal(changes.market, options);
    const { filter, next } = revisionGuard(stored);
    const updated = await CyberiaAction.findOneAndUpdate(
      filter,
      { $set: { ...changes, revision: next } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) throw httpError(409, `Action ${stored.code} changed while saving: reload it`);
    return updated;
  };
  /** What the economy capabilities of the action do in each world of its map. */
  static diagnostics = async (req, res, options) => {
    const action = await DataBaseProviderService.getModel('CyberiaAction', options).findById(req.params.id).lean();
    if (!action) throw httpError(404, 'action not found');
    return await terminalDiagnostics(action, options);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    if (req.params.id) return await CyberiaAction.findByIdAndDelete(req.params.id);
    else return await CyberiaAction.deleteMany();
  };
}

export { CyberiaActionService };
