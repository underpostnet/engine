import { QuestComponent } from '../../client/components/cyberia/CommonCyberia.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaWsUserManagement } from '../../ws/cyberia/management/cyberia.ws.user.js';

const logger = loggerFactory(import.meta);

const CyberiaQuestService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    /** @type {import('../cyberia-user/cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaUser;

    const wsManagementId = `${options.host}${options.path}`;

    if (req.path.startsWith('/take-anon')) {
      if (
        CyberiaWsUserManagement.element[wsManagementId][req.body.socketId].model.quests.find(
          (q) => q.id === req.params.questId,
        )
      )
        throw new Error('quest has already been taken');
      const questObj = {
        displaySearchObjects: QuestComponent.Data[req.params.questId]().displaySearchObjects,
        id: req.params.questId,
        sagaId: req.params.sagaId,
        currentStep: 0,
      };
      CyberiaWsUserManagement.element[wsManagementId][req.body.socketId].model.quests.push(questObj);
      return 'success take quest';
    }

    if (req.path.startsWith('/abandon-anon')) {
      if (
        !CyberiaWsUserManagement.element[wsManagementId][req.body.socketId].model.quests.find(
          (q) => q.id === req.params.questId,
        )
      )
        throw new Error('quest has not already been taken');

      CyberiaWsUserManagement.element[wsManagementId][req.body.socketId].model.quests = CyberiaWsUserManagement.element[
        wsManagementId
      ][req.body.socketId].model.quests.filter((q) => q.id !== req.params.questId);
      return 'success abandon take quest';
    }

    if (req.path.startsWith('/take')) {
      const cyberiaUser = await CyberiaUser.findOne({ 'model.user._id': req.auth.user._id });
      if (cyberiaUser) {
          if (!QuestComponent.Data[req.params.questId]) throw new Error(`quest ${req.params.questId} not found`);

          const wsManagementId = `${options.host}${options.path}`;

        const cyberiaUserWsId = CyberiaWsUserManagement.getCyberiaUserWsId(wsManagementId, cyberiaUser._id.toString());

        if (!CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests)
          CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests = [];

        const indexQuest = CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests.findIndex(
          (q) => q.id === req.params.questId,
          );

          const questObj = {
            displaySearchObjects: QuestComponent.Data[req.params.questId]().displaySearchObjects,
            id: req.params.questId,
            sagaId: req.params.sagaId,
            currentStep: 0,
          };

        if (indexQuest >= 0)
          CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests[indexQuest] = questObj;
        else CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests.push(questObj);

          return 'success take quest';
      } else throw new Error('user not found');
    }

    if (req.path.startsWith('/abandon')) {
      const cyberiaUser = await CyberiaUser.findOne({ 'model.user._id': req.auth.user._id });
      if (cyberiaUser) {
        const cyberiaUserWsId = CyberiaWsUserManagement.getCyberiaUserWsId(wsManagementId, cyberiaUser._id.toString());
        if (
          CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests.find(
            (q) => q.id === req.params.questId,
          )
        ) {
          CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests =
            CyberiaWsUserManagement.element[wsManagementId][cyberiaUserWsId].model.quests.filter(
              (q) => q.id !== req.params.questId,
            );

          return 'success abandon take quest';
        } else throw new Error('quest has not already been taken');
      } else throw new Error('user not found');
    }

    return await new CyberiaQuest(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    return await CyberiaQuest.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    return await CyberiaQuest.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaQuest;
    return await CyberiaQuest.findByIdAndDelete(req.params.id);
  },
};

export { CyberiaQuestService };
