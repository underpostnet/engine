import { PeerServer } from 'peer';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

const peerOptions = { port: process.env.PEER_PORT };

const peerServer = app =>
    PeerServer(peerOptions, () => {
        logger.info(`Peer Server is running on port ${peerOptions.port}`);
    });

export { peerServer, peerOptions };