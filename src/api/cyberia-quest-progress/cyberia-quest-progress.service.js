import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaQuestProgressService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-quest-progress.model.js').CyberiaQuestProgressModel} */
    const CyberiaQuestProgress = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuestProgress;
    return await new CyberiaQuestProgress(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-quest-progress.model.js').CyberiaQuestProgressModel} */
    const CyberiaQuestProgress = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuestProgress;
    if (req.params.id) return await CyberiaQuestProgress.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaQuestProgress.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaQuestProgress.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-quest-progress.model.js').CyberiaQuestProgressModel} */
    const CyberiaQuestProgress = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuestProgress;
    return await CyberiaQuestProgress.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-quest-progress.model.js').CyberiaQuestProgressModel} */
    const CyberiaQuestProgress = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuestProgress;
    if (req.params.id) return await CyberiaQuestProgress.findByIdAndDelete(req.params.id);
    else return await CyberiaQuestProgress.deleteMany();
  };
}

export { CyberiaQuestProgressService };
