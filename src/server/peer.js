import { PeerServer } from 'peer';
import dotenv from 'dotenv';
import { loggerFactory } from './logger.js';
import fs from 'fs-extra';

dotenv.config();

const logger = loggerFactory(import.meta);

const createPeerServer = ({ port }) => {
  /** @type {import('peer').IConfig} */
  const options = {
    port,
    // corsOptions: {
    //   origin: '*',
    // },
    // proxied: true,
    // key: fs.readFileSync(''),
    // cert: fs.readFileSync(''),
    // ca: fs.readFileSync(''),
  };
  return PeerServer(options);
};

export { createPeerServer };
