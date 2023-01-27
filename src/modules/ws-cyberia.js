
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { logger } from '../modules/logger.js';

dotenv.config();

const wsCyberia = app => {

    const wsCyberiaClients = [];
    const wsCyberiaServer = new WebSocket.Server({ port: process.env.CYBERIA_WS_PORT });

    wsCyberiaServer.on('connection', async ws => {

        wsCyberiaClients.push(ws);
        // ws.send();

        ws.on('close', () => {

        });

        ws.on('message', async msg => {

        });

    });

    logger.info(`Ws Cyberia Server is running on port ${process.env.CYBERIA_WS_PORT}`);

    return {
        wsCyberiaClients,
        wsCyberiaServer
    };

};



export { wsCyberia };