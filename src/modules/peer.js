import { PeerServer } from 'peer';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

const peerOptions = {
    port: process.env.PEER_PORT,
    /* proxied: true */
};

if (process.env.NODE_ENV != 'development') peerOptions.ssl = {
    key: fs.readFileSync('C:/dd/virtual_machine/SSL/services_cyberiaonline/ssl/key.key'),
    cert: fs.readFileSync('C:/dd/virtual_machine/SSL/services_cyberiaonline/ssl/crt.crt'),
    ca: fs.readFileSync('C:/dd/virtual_machine/SSL/services_cyberiaonline/ssl/ca_bundle.crt')
};

const peerServer = app =>
    PeerServer(peerOptions, () => {
        logger.info(`Peer Server is running on port ${peerOptions.port}`);
    });

export { peerServer, peerOptions };