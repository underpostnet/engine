'use strict';

import { IoServer } from '../IoServer.js';
import { CyberiaWsConnection } from './cyberia.ws.connection.js';

// https://socket.io/docs/v3/

const createIoServer = (httpServer, options) => IoServer(httpServer, options, CyberiaWsConnection);

const CyberiaWsServer = createIoServer;

export { createIoServer, CyberiaWsServer };
