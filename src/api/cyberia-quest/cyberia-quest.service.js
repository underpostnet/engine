import { QuestComponent } from '../../client/components/cyberia/CommonCyberia.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaWsUserManagement } from '../../ws/cyberia/management/cyberia.ws.user.js';

const logger = loggerFactory(import.meta);

const CyberiaQuestService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaQuest;
    /** @type {import('../cyberia-user/cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaUser;

    switch (options.uri) {
      case '/take':
        const cyberiaUser = await CyberiaUser.findOne({ 'model.user._id': req.auth.user._id });
        if (cyberiaUser) {
          if (!cyberiaUser.model.quests.find((q) => q.id === req.params.questId)) {
            if (!QuestComponent.Data[req.params.questId]) throw new Error(`quest ${req.params.questId} not found`);

            const wsManagementId = `${options.host}${options.path}`;

            const cyberiaUserWsId = CyberiaWsUserManagement.getCyberiaUserWsId(
              wsManagementId,
              cyberiaUser._id.toString(),
            );

            const questObj = {
              displaySearchObjects: QuestComponent.Data[req.params.questId].displaySearchObjects,
              id: req.params.questId,
            };

            if (!CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests)
              CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests = [];

            CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests.push(questObj);

            return 'success take quest';
          } else throw new Error('quest already take');
        } else throw new Error('user not found');

      default:
        break;
    }
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
