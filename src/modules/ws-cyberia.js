
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

const wsCyberia = app => {

    const wsCyberiaClients = [];
    const wsCyberiaElements = [];
    const wsCyberiaServer = new WebSocket.Server({ port: process.env.CYBERIA_WS_PORT });

    wsCyberiaServer.on('connection', async ws => {

        console.log('ws conecction', ws);
        const index = wsCyberiaClients.length;
        wsCyberiaClients.push(ws);
        // ws.send();

        ws.on('close', () => {
            wsCyberiaElements[index].state = 'close';
            wsCyberiaElements[index].update = new Date().toISOString();
            wsCyberiaClients.map((wsClient, i) => {
                if (i !== index)
                    wsClient.send(JSON.stringify(wsCyberiaElements[index]));
            });
        });

        ws.on('message', strDataElement => {
            const dataElement = JSON.parse(strDataElement);
            wsCyberiaElements[index] = dataElement;
            wsCyberiaElements[index].update = new Date().toISOString();
            wsCyberiaClients.map((wsClient, i) => {
                if (i !== index)
                    wsClient.send(JSON.stringify(wsCyberiaElements[index]));
            });
        });

    });

    logger.info(`Ws Cyberia Server is running on port ${process.env.CYBERIA_WS_PORT}`);

    return {
        wsCyberiaClients,
        wsCyberiaServer
    };

};



export { wsCyberia };