'use strict';

import { IoServer } from '../IoServer.js';
import { CyberiaWsConnection } from './cyberia.ws.connection.js';

import { CoreWsChatManagement } from '../core/management/core.ws.chat.js';
import { CyberiaWsBotManagement } from './management/cyberia.ws.bot.js';
import { CyberiaWsUserManagement } from './management/cyberia.ws.user.js';
import { CyberiaWsSkillManagement } from './management/cyberia.ws.skill.js';

// https://socket.io/docs/v3/

const createIoServer = async (httpServer, options) => {
  const { host, path } = options;
  const wsManagementId = `${host}${path}`;

  CyberiaWsUserManagement.instance(wsManagementId);
  CyberiaWsBotManagement.instance(wsManagementId);
  CyberiaWsSkillManagement.instance(wsManagementId);
  CoreWsChatManagement.instance(wsManagementId);
  return IoServer(httpServer, options, (socket) => CyberiaWsConnection(socket, wsManagementId));
};

const CyberiaWsServer = createIoServer;

export { createIoServer, CyberiaWsServer };
