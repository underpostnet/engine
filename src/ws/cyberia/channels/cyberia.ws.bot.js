import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsBotManagement } from '../management/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from '../management/cyberia.ws.user.js';

const channel = 'bot';
const meta = { url: `ws-cyberia-${channel}` };
const logger = loggerFactory(meta);

const CyberiaWsBotController = {
  channel,
  meta,
  controller: function (socket, client, args, wsManagementId) {
    const { status, element } = args;
    switch (status) {
      case 'update-world-face':
        for (const botId of Object.keys(CyberiaWsBotManagement.element[wsManagementId])) {
          if (objectEquals(CyberiaWsBotManagement.element[wsManagementId][botId].model.world, element.model.world)) {
            client[socket.id].emit(
              channel,
              JSON.stringify({
                status: 'connection',
                id: botId,
                element: CyberiaWsBotManagement.element[wsManagementId][botId],
              }),
            );
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
        objectEquals(
          CyberiaWsBotManagement.element[wsManagementId][botId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      ) {
        client[socket.id].emit(
          channel,
          JSON.stringify({
            status: 'connection',
            id: botId,
            element: CyberiaWsBotManagement.element[wsManagementId][botId],
          }),
        );
      }
    }
  },
  disconnect: function (socket, client, reason, wsManagementId) {},
};

const CyberiaWsBotChannel = IoCreateChannel(CyberiaWsBotController);

export { CyberiaWsBotChannel, CyberiaWsBotController };
