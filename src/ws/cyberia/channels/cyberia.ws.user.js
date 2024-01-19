import { newInstance, objectEquals } from '../../../client/components/core/CommonJs.js';
import { BaseElement } from '../../../client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../../../server/logger.js';

const channel = 'user';
const meta = { url: `ws-cyberia-${channel}` };
const logger = loggerFactory(meta);

const CyberiaWsUserChannel = {
  element: {},
  socket: {},
  baseElement: BaseElement()[channel].main,
  controller: function (socket, args) {
    args = JSON.parse(args);
    logger.info(`CyberiaWsUserChannel controller`, { id: socket.id, args });
    const { status, element } = args;
    switch (status) {
      case 'update-position':
        this.element[socket.id].x = element.x;
        this.element[socket.id].y = element.y;
        for (const elementId of Object.keys(this.element)) {
          if (
            elementId !== socket.id &&
            objectEquals(this.element[elementId].model.world, this.element[socket.id].model.world)
          ) {
            this.socket[elementId].emit(
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
        for (const elementId of Object.keys(this.element)) {
          if (
            elementId !== socket.id &&
            objectEquals(this.element[elementId].model.world, this.element[socket.id].model.world)
          ) {
            this.socket[elementId].emit(
              channel,
              JSON.stringify({
                status: 'disconnect',
                id: socket.id,
              }),
            );
          }
        }
        this.element[socket.id].model.world = element.model.world;
        for (const elementId of Object.keys(this.element)) {
          if (objectEquals(this.element[elementId].model.world, this.element[socket.id].model.world)) {
            if (elementId !== socket.id) {
              this.socket[elementId].emit(
                channel,
                JSON.stringify({
                  status: 'connection',
                  id: socket.id,
                  element: this.element[socket.id],
                }),
              );
              socket.emit(
                channel,
                JSON.stringify({
                  status: 'connection',
                  id: elementId,
                  element: this.element[elementId],
                }),
              );
            }
          }
        }
        break;
      case 'update-skin-position':
        this.element[socket.id].components.skin = element.components.skin;
        for (const elementId of Object.keys(this.element)) {
          if (
            elementId !== socket.id &&
            objectEquals(this.element[elementId].model.world, this.element[socket.id].model.world)
          ) {
            this.socket[elementId].emit(
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
  connection: function (socket) {
    logger.info(`CyberiaWsUserChannel connection`, socket.id);
    socket.on(channel, (args) => this.controller(socket, args));

    this.element[socket.id] = newInstance(this.baseElement);
    this.socket[socket.id] = socket;

    for (const elementId of Object.keys(this.element)) {
      if (objectEquals(this.element[elementId].model.world, this.element[socket.id].model.world)) {
        this.socket[elementId].emit(
          channel,
          JSON.stringify({
            status: 'connection',
            id: socket.id,
            element: this.element[socket.id],
          }),
        );
        if (elementId !== socket.id)
          socket.emit(
            channel,
            JSON.stringify({
              status: 'connection',
              id: elementId,
              element: this.element[elementId],
            }),
          );
      }
    }
  },
  disconnect: function (socket, reason) {
    logger.info(`CyberiaWsUserChannel disconnect`, socket.id, reason);
    for (const elementId of Object.keys(this.element)) {
      if (
        elementId !== socket.id &&
        objectEquals(this.element[elementId].model.world, this.element[socket.id].model.world)
      )
        this.socket[elementId].emit(
          channel,
          JSON.stringify({
            status: 'disconnect',
            id: socket.id,
          }),
        );
    }
    delete this.element[socket.id];
    delete this.socket[socket.id];
  },
};

export { CyberiaWsUserChannel };
