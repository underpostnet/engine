import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsBotManagement } from '../management/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from '../management/cyberia.ws.user.js';

const channel = 'bot';
const logger = loggerFactory(import.meta);

const CyberiaWsBotController = {
  channel,
  controller: function (socket, client, payload, wsManagementId) {
    const { status, element } = payload;
    switch (status) {
      case 'update-world-face':
        for (const botId of Object.keys(CyberiaWsBotManagement.element[wsManagementId])) {
          if (
            !CyberiaWsBotManagement.localElementScope[wsManagementId][botId].disabled &&
            objectEquals(CyberiaWsBotManagement.element[wsManagementId][botId].model.world, element.model.world)
          ) {
            CyberiaWsEmit(channel, client[socket.id], {
              status: 'connection',
              id: botId,
              element: CyberiaWsBotManagement.element[wsManagementId][botId],
            });
          }
        }
        break;
      default:
        break;
    }
  },
  connection: function (socket, client, wsManagementId) {
    for (const botId of Object.keys(CyberiaWsBotManagement.element[wsManagementId])) {
      if (
        !CyberiaWsBotManagement.localElementScope[wsManagementId][botId].disabled &&
        objectEquals(
          CyberiaWsBotManagement.element[wsManagementId][botId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      ) {
        CyberiaWsEmit(channel, client[socket.id], {
          status: 'connection',
          id: botId,
          element: CyberiaWsBotManagement.element[wsManagementId][botId],
        });
      }
    }
  },
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const CyberiaWsBotChannel = IoCreateChannel(CyberiaWsBotController);

export { CyberiaWsBotChannel, CyberiaWsBotController };
