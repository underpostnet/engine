import { objectEquals } from '../../../client/components/core/CommonJs.js';
import { BaseElement } from '../../../client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../../../server/logger.js';
import { IoCreateChannel } from '../../IoInterface.js';
import { CyberiaWsUserManagement } from '../management/cyberia.ws.user.js';

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
            client[elementId].emit(
              channel,
              JSON.stringify({
                status,
                id: socket.id,
                element: { x: element.x, y: element.y },
              }),
            );
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
            client[elementId].emit(
              channel,
              JSON.stringify({
                status: 'disconnect',
                id: socket.id,
              }),
            );
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
              client[elementId].emit(
                channel,
                JSON.stringify({
                  status: 'connection',
                  id: socket.id,
                  element: CyberiaWsUserManagement.element[wsManagementId][socket.id],
                }),
              );
              socket.emit(
                channel,
                JSON.stringify({
                  status: 'connection',
                  id: elementId,
                  element: CyberiaWsUserManagement.element[wsManagementId][elementId],
                }),
              );
            }
          }
        }
        break;
      case 'update-skin-position':
        CyberiaWsUserManagement.element[wsManagementId][socket.id].components.skin = element.components.skin;
        for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
          if (
            elementId !== socket.id &&
            objectEquals(
              CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
              CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
            )
          ) {
            client[elementId].emit(
              channel,
              JSON.stringify({
                status,
                id: socket.id,
                element: { components: { skin: element.components.skin } },
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
    CyberiaWsUserManagement.element[wsManagementId][socket.id] = BaseElement()[channel].main;
    for (const elementId of Object.keys(CyberiaWsUserManagement.element[wsManagementId])) {
      if (
        objectEquals(
          CyberiaWsUserManagement.element[wsManagementId][elementId].model.world,
          CyberiaWsUserManagement.element[wsManagementId][socket.id].model.world,
        )
      ) {
        client[elementId].emit(
          channel,
          JSON.stringify({
            status: 'connection',
            id: socket.id,
            element: CyberiaWsUserManagement.element[wsManagementId][socket.id],
          }),
        );
        if (elementId !== socket.id)
          socket.emit(
            channel,
            JSON.stringify({
              status: 'connection',
              id: elementId,
              element: CyberiaWsUserManagement.element[wsManagementId][elementId],
            }),
          );
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
        client[elementId].emit(
          channel,
          JSON.stringify({
            status: 'disconnect',
            id: socket.id,
          }),
        );
    }
    delete CyberiaWsUserManagement.element[wsManagementId][socket.id];
  },
};

const CyberiaWsUserChannel = IoCreateChannel(CyberiaWsUserController);

export { CyberiaWsUserChannel, CyberiaWsUserController };
