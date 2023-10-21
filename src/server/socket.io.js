'use strict';

import { Server } from 'socket.io';
import { loggerFactory } from './logger.js';

// https://socket.io/docs/v3/

const createIoServer = (httpServer, options) => {
  const logger = loggerFactory(options.meta);
  return new Server(httpServer, {
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
  }).on('connection', (socket) => {
    // const headers = socket.handshake.headers;
    // const ip = socket.handshake.address;
    logger.info(`on connection id: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.info(`on disconnect id: ${socket.id} due to reason: ${reason}`);
    });
  });
};

export { createIoServer };
