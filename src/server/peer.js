import { PeerServer } from 'peer';
import dotenv from 'dotenv';
import { loggerFactory } from './logger.js';
import fs from 'fs-extra';
import UnderpostStartUp from './start.js';

dotenv.config();

const logger = loggerFactory(import.meta);

// https://github.com/peers/peerjs
// https://github.com/peers/peerjs-server

const createPeerServer = async ({ port, devPort, origins, host, path }) => {
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
  const peerServer = UnderpostStartUp.API.listenServerFactory(() => PeerServer(options));

  return { options, peerServer, meta: import.meta };
};

export { createPeerServer };
