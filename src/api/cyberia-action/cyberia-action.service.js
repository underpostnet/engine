import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { DefaultCyberiaActions } from '../cyberia-server-defaults/cyberia-server-defaults.js';

const logger = loggerFactory(import.meta);

class CyberiaActionService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    return await new CyberiaAction(req.body).save();
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
    // The fallback world serves actions from the canonical defaults and never
    // persists them. Serve the same defaults here, so the client can fetch an
    // action by code. Quest offers come from the cyberia-quest API by cell.
    const fallback = DefaultCyberiaActions.find((a) => a.code === code);
    if (fallback) return fallback;
    throw new Error(`No action found for code: ${code}`);
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    return await CyberiaAction.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    if (req.params.id) return await CyberiaAction.findByIdAndDelete(req.params.id);
    else return await CyberiaAction.deleteMany();
  };
}

export { CyberiaActionService };
