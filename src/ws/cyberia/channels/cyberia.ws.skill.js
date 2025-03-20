import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsInstanceScope } from '../cyberia.ws.server.js';
import { CyberiaWsSkillManagement } from '../management/cyberia.ws.skill.js';
import { CyberiaWsUserManagement } from '../management/cyberia.ws.user.js';

const channel = 'skill';
const logger = loggerFactory(import.meta);

const CyberiaWsSkillController = {
  channel,
  controller: function (socket, client, payload, wsManagementId) {
    switch (payload.status) {
      case 'create':
        if (!CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].immunityQuestModalDialog)
          CyberiaWsSkillManagement.createSkill(
            wsManagementId,
            { id: socket.id, type: 'user' },
            payload.skillKey,
            CyberiaWsInstanceScope[wsManagementId].biome.instance,
          );
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
