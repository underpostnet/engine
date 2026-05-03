import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaQuestService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    return await new CyberiaQuest(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    if (req.params.id) return await CyberiaQuest.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaQuest.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaQuest.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    return await CyberiaQuest.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    if (req.params.id) return await CyberiaQuest.findByIdAndDelete(req.params.id);
    else return await CyberiaQuest.deleteMany();
  };
}

export { CyberiaQuestService };
