import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const CyberiaQuestService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaQuest;
    return await new CyberiaQuest(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaQuest;
    return await CyberiaQuest.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaQuest;
    return await CyberiaQuest.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaQuest;
    return await CyberiaQuest.findByIdAndDelete(req.params.id);
  },
};

export { CyberiaQuestService };
