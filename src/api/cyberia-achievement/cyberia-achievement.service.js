import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaAchievementService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-achievement.model.js').CyberiaAchievementModel} */
    const CyberiaAchievement =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAchievement;
    return await new CyberiaAchievement(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-achievement.model.js').CyberiaAchievementModel} */
    const CyberiaAchievement =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAchievement;
    if (req.params.id) return await CyberiaAchievement.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaAchievement.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaAchievement.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-achievement.model.js').CyberiaAchievementModel} */
    const CyberiaAchievement =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAchievement;
    return await CyberiaAchievement.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-achievement.model.js').CyberiaAchievementModel} */
    const CyberiaAchievement =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaAchievement;
    if (req.params.id) return await CyberiaAchievement.findByIdAndDelete(req.params.id);
    else return await CyberiaAchievement.deleteMany();
  };
}

export { CyberiaAchievementService };
