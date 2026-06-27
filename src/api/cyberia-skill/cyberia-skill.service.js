import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaSkillService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-skill.model.js').CyberiaSkillModel} */
    const CyberiaSkill = DataBaseProviderService.getModel("CyberiaSkill", options);
    return await new CyberiaSkill(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-skill.model.js').CyberiaSkillModel} */
    const CyberiaSkill = DataBaseProviderService.getModel("CyberiaSkill", options);
    if (req.params.id) return await CyberiaSkill.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaSkill.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaSkill.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-skill.model.js').CyberiaSkillModel} */
    const CyberiaSkill = DataBaseProviderService.getModel("CyberiaSkill", options);
    return await CyberiaSkill.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-skill.model.js').CyberiaSkillModel} */
    const CyberiaSkill = DataBaseProviderService.getModel("CyberiaSkill", options);
    if (req.params.id) return await CyberiaSkill.findByIdAndDelete(req.params.id);
    else return await CyberiaSkill.deleteMany();
  };
}

export { CyberiaSkillService };
