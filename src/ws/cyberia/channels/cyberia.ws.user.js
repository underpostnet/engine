import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { BaseElement } from '../../../client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsEmit } from '../cyberia.ws.emit.js';
import { CyberiaWsSkillManagement } from '../management/cyberia.ws.skill.js';
import { CyberiaWsUserManagement } from '../management/cyberia.ws.user.js';
import { CyberiaWsSkillChannel } from './cyberia.ws.skill.js';

const channel = 'user';
const meta = { url: `ws-cyberia-${channel}` };
const logger = loggerFactory(meta);

const CyberiaWsUserController = {
  channel,
  meta,
  controller: function (socket, client, args, wsManagementId) {
    const { status, element } = args;
    switch (status) {
      case 'update-position':
        CyberiaWsUserManagement.element[wsManagementId][socket.id].x = element.x;
        CyberiaWsUserManagement.element[wsManagementId][socket.id].y = element.y;
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            elementId !== socket.id &&
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(channel, client[elementId], {
              status,
              id: socket.id,
              element: { x: element.x, y: element.y },
            });
          }
        }
        break;
      case 'update-world-face':
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            elementId !== socket.id &&
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(channel, client[elementId], {
              status: 'disconnect',
              id: socket.id,
            });
          }
        }
        CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world = element.model.world;
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            if (elementId !== socket.id) {
              CyberiaWsEmit(channel, client[elementId], {
                status: 'connection',
                id: socket.id,
                element: CyberiaWsUserManagement.element[wsManagementId][socket.id],
              });
              CyberiaWsEmit(channel, socket, {
                status: 'connection',
                id: elementId,
                element: CyberiaWsUserManagement.element[wsManagementId][elementId],
              });
            }
          }
        }
        for (const elementId of Object.keys(CyberiaWsSkillManagement.element[wsManagementId])) {
          if (
            objectEquals(
              CyberiaWsSkillManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(CyberiaWsSkillChannel.channel, socket, {
              status: 'connection',
              id: elementId,
              element: CyberiaWsSkillManagement.element[wsManagementId][elementId],
            });
          }
        }
        break;
      case 'update-skin-position':
        CyberiaWsUserManagement.element[wsManagementId][socket.id].components.skin = element.components.skin;
        CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id].direction = args.direction;
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            elementId !== socket.id &&
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            CyberiaWsEmit(channel, client[elementId], {
              status,
              id: socket.id,
              element: { components: { skin: element.components.skin } },
            });
          }
        }
        break;
      default:
        break;
    }
  },
  connection: function (socket, client, wsManagementId) {
    CyberiaWsUserManagement.element[wsManagementId][socket.id] = BaseElement()[channel].main;
    CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id] = {
      direction: 's',
    };
    for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
      if (
        objectEquals(
          CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      ) {
        CyberiaWsEmit(channel, client[elementId], {
          status: 'connection',
          id: socket.id,
          element: CyberiaWsUserManagement.element[wsManagementId][socket.id],
        });
        if (elementId !== socket.id)
          CyberiaWsEmit(channel, socket, {
            status: 'connection',
            id: elementId,
            element: CyberiaWsUserManagement.element[wsManagementId][elementId],
          });
      }
    }
  },
  disconnect: function (socket, client, reason, wsManagementId) {
    for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
      if (
        elementId !== socket.id &&
        objectEquals(
          CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      )
        CyberiaWsEmit(channel, client[elementId], {
          status: 'disconnect',
          id: socket.id,
        });
    }
    delete CyberiaWsUserManagement.element[wsManagementId][socket.id];
    delete CyberiaWsUserManagement.localElementScope[wsManagementId][socket.id];
  },
};

const CyberiaWsUserChannel = IoCreateChannel(CyberiaWsUserController);

export { CyberiaWsUserChannel, CyberiaWsUserController };
