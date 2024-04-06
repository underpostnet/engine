import { PeerServer } from 'peer';
import dotenv from 'dotenv';
import { loggerFactory } from './logger.js';
import fs from 'fs-extra';

dotenv.config();

const logger = loggerFactory(import.meta);

// https://github.com/peers/peerjs
// https://github.com/peers/peerjs-server

const createPeerServer = ({ port, devPort, origins, path }) => {
  if (process.env.NODE_ENV === 'development' && devPort) origins.push(`http://localhost:${devPort}`);
  /** @type {import('peer').IConfig} */
  const options = {
    port,
    path: `${path === '/' ? '' : path}/peer`,
    corsOptions: {
      origin: origins,
    },
    proxied: true,
    // key: fs.readFileSync(''),
    // cert: fs.readFileSync(''),
    // ca: fs.readFileSync(''),
  };
  return PeerServer(options);
};

export { createPeerServer };
