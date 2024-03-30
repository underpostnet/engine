'use strict';

import { Server } from 'socket.io';
import { loggerFactory } from '../server/logger.js';

// https://socket.io/docs/v3/

const logger = loggerFactory(import.meta);

const IoServer = (httpServer, options = {}, Connection = () => {}) =>
  new Server(httpServer, {
    cors: {
      // origin: `http://localhost:${options.port}`,
      origins: options.origins,
      methods: ['GET', 'POST', 'DELETE', 'PUT'],
      allowedHeaders: [
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Origin',
        'X-Requested-With',
        'X-Access-Token',
        'Content-Type',
        'Host',
        'Accept',
        'Connection',
        'Cache-Control',
      ],
      credentials: true,
    },
    path: options.path !== '/' ? `${options.path}/socket.io/` : undefined,
  }).on('connection', Connection);

export { IoServer };
