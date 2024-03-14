import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsSkillManagement } from '../management/cyberia.ws.skill.js';
import { CyberiaWsUserManagement } from '../management/cyberia.ws.user.js';

const channel = 'skill';
const logger = loggerFactory(import.meta);

const CyberiaWsSkillController = {
  channel,
  controller: function (socket, client, args, wsManagementId) {
    switch (args.status) {
      case 'create':
        CyberiaWsSkillManagement.createSkill(wsManagementId, { id: socket.id, type: 'user' }, args.skillKey);
        break;

      default:
        break;
    }
  },
  connection: function (socket, client, wsManagementId) {
    for (const skillId of Object.keys(CyberiaWsSkillManagement.element[wsManagementId])) {
      if (
        objectEquals(
          CyberiaWsSkillManagement.element[wsManagementId][skillId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      ) {
        CyberiaWsEmit(channel, client[skillId], {
          status: 'connection',
          id: skillId,
          element: CyberiaWsSkillManagement.element[wsManagementId][skillId],
        });
      }
    }
  },
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const CyberiaWsSkillChannel = IoCreateChannel(CyberiaWsSkillController);

export { CyberiaWsSkillChannel, CyberiaWsSkillController };
