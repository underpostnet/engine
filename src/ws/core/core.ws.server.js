'use strict';

import { IoServer } from '../IoServer.js';
import { CoreWsConnection } from './core.ws.connection.js';
import { CoreWsChatManagement } from './management/core.ws.chat.js';
import { CoreWsMailerManagement } from './management/core.ws.mailer.js';
import { CoreWsStreamManagement } from './management/core.ws.stream.js';

// https://socket.io/docs/v3/

const createIoServer = async (httpServer, options) => {
  const { host, path } = options;
  const wsManagementId = `${host}${path}`;

  CoreWsChatManagement.instance(wsManagementId);
  CoreWsMailerManagement.instance(wsManagementId);
  CoreWsStreamManagement.instance(wsManagementId);

  return IoServer(httpServer, options, (socket) => CoreWsConnection(socket, wsManagementId));
};

const CoreWsServer = createIoServer;

export { createIoServer, CoreWsServer };
