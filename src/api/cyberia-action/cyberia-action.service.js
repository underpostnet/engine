import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaActionService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAction;
    return await new CyberiaAction(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAction;
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
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAction;
    return await CyberiaAction.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-action.model.js').CyberiaActionModel} */
    const CyberiaAction = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAction;
    if (req.params.id) return await CyberiaAction.findByIdAndDelete(req.params.id);
    else return await CyberiaAction.deleteMany();
  };
}

export { CyberiaActionService };
