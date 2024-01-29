import { getId, objectEquals } from '../../../client/components/core/CommonJs.js';
import { BaseElement } from '../../../client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsUserController } from './cyberia.ws.user.js';

const channel = 'bot';
const meta = { url: `ws-cyberia-${channel}` };
const logger = loggerFactory(meta);

const element = {};

element[getId(element, 'bot-')] = BaseElement().bot.main;

const CyberiaWsBotController = {
  element,
  channel,
  meta,
  controller: function (socket, client, args) {
    const { status, element } = args;
    switch (status) {
      case 'update-world-face':
        for (const botId of Object.keys(this.element)) {
          for (const clientId of Object.keys(client)) {
            if (objectEquals(this.element[botId].model.world, element.model.world)) {
              client[clientId].emit(
                channel,
                JSON.stringify({
                  status: 'connection',
                  id: botId,
                  element: this.element[botId],
                }),
              );
            }
          }
        }
        break;
      default:
        break;
    }
  },
  connection: function (socket, client) {
    for (const botId of Object.keys(this.element)) {
      for (const clientId of Object.keys(client)) {
        if (objectEquals(this.element[botId].model.world, CyberiaWsUserController.element[clientId].model.world)) {
          client[clientId].emit(
            channel,
            JSON.stringify({
              status: 'connection',
              id: botId,
              element: this.element[botId],
            }),
          );
        }
      }
    }
  },
  disconnect: function (socket, client, reason) {},
};

const CyberiaWsBotChannel = IoCreateChannel(CyberiaWsBotController);

export { CyberiaWsBotChannel, CyberiaWsBotController };
