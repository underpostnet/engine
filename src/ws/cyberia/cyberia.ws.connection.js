import { loggerFactory } from '../../server/logger.js';
import { CoreWsChatChannel } from '../core/channels/core.ws.chat.js';
import { CoreWsMailerChannel } from '../core/channels/core.ws.mailer.js';
import { CyberiaWsBotChannel } from './channels/cyberia.ws.bot.js';
import { CyberiaWsSkillChannel } from './channels/cyberia.ws.skill.js';
import { CyberiaWsUserChannel } from './channels/cyberia.ws.user.js';

const logger = loggerFactory(import.meta);

const CyberiaWsConnection = function (socket, wsManagementId) {
  // const headers = socket.handshake.headers;
  // const ip = socket.handshake.address;
  // const { query, auth } = socket.handshake;

  logger.info(`CyberiaWsConnection ${socket.id}`);

  CyberiaWsUserChannel.connection(socket, wsManagementId);
  CyberiaWsBotChannel.connection(socket, wsManagementId);
  CyberiaWsSkillChannel.connection(socket, wsManagementId);

  CoreWsChatChannel.connection(socket, wsManagementId);
  CoreWsMailerChannel.connection(socket, wsManagementId);

  socket.on('disconnect', (reason) => {
    logger.info(`CyberiaWsConnection ${socket.id} due to reason: ${reason}`);

    CyberiaWsUserChannel.disconnect(socket, reason, wsManagementId);
    CyberiaWsBotChannel.disconnect(socket, reason, wsManagementId);
    CyberiaWsSkillChannel.disconnect(socket, reason, wsManagementId);

    CoreWsChatChannel.disconnect(socket, reason, wsManagementId);
    CoreWsMailerChannel.disconnect(socket, reason, wsManagementId);
  });
};

export { CyberiaWsConnection };
