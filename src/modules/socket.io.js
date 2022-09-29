

import { Server } from 'socket.io';
import { createServer } from 'http';
import { PeerServer, ExpressPeerServer } from 'peer';
import fs from 'fs';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import express from 'express';
import cors from 'cors';

dotenv.config();
/*
const httpServer = createServer(process.env.NODE_ENV == 'development' || process.argv[2] == 'build' ? undefined : {
    key: fs.readFileSync('C:/dd/virtual_machine/SSL/cyberiaonline/cyberiaonline.com-key.pem'),
    cert: fs.readFileSync('C:/dd/virtual_machine/SSL/cyberiaonline/cyberiaonline.com-crt.pem'),
    requestCert: true,
    ca: [
        fs.readFileSync('C:/dd/virtual_machine/SSL/cyberiaonline/cyberiaonline.com-chain.pem')
    ]
});
*/


const ioModule = (app, options) => {

    const httpServer = createServer({}, app);
    /**/
    const io = new Server(httpServer, {
        cors: {
            // origin: `http://localhost:${process.env.PORT}`,
            origins: process.env.NODE_ENV == 'development' ?
                [`http://localhost:${process.env.PORT}`, 'http://localhost:3001'] :
                [`https://www.cyberiaonline.com`, 'https://underpost.net'],
            methods: ['GET', 'POST']
            // allowedHeaders: [
            //     'Access-Control-Allow-Headers',
            //     'Access-Control-Allow-Origin',
            //     'X-Requested-With',
            //     'X-Access-Token',
            //     'Content-Type',
            //     'Host',
            //     'Accept',
            //     'Connection',
            //     'Cache-Control',
            // ],
            // credentials: true
        } /*process.env.NODE_ENV == 'development' ? : {
            origin: '*',
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
            credentials: true
        }*/
    });

    // When someone connects to the server
    io.on('connection', socket => {
        // console.log('io connection', socket);
        // When someone attempts to join the room
        socket.on('join-room', (roomId, userId) => {
            socket.join(roomId)  // Join the room
            socket.broadcast.emit('user-connected', userId) // Tell everyone else in the room that we joined

            // Communicate the disconnection
            socket.on('disconnect', () => {
                socket.broadcast.emit('user-disconnected', userId)
            })
        })
    });

    // httpServer.listen(process.env.IO_PORT);
    /**/
    const peerOptions = {
        port: process.env.PEER_PORT,
        proxied: true
    };
    if (process.env.NODE_ENV != 'development') peerOptions.ssl = {
        key: fs.readFileSync('C:/dd/virtual_machine/SSL/nexodev/ssl/key.key'),
        cert: fs.readFileSync('C:/dd/virtual_machine/SSL/nexodev/ssl/crt.crt'),
        ca: fs.readFileSync('C:/dd/virtual_machine/SSL/nexodev/ssl/ca_bundle.crt')
    };


    const peerServer = PeerServer(peerOptions, () => {
        logger.info(`Peer Server is running on port ${process.env.PEER_PORT}`);
    });

    if (options && options.origin)
        peerServer.use(cors({ origin: options.origin }));

    // peerServer.use(function (req, res, next) {
    //     res.header("Access-Control-Allow-Origin", "*");
    //     // res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    //     next();
    // });

    // const peerApp = express();

    // if (options && options.origin)
    //     peerApp.use(cors({ origin: options.origin }));

    // const httpPeerServer = createServer(peerApp);
    // const peerServer = ExpressPeerServer(httpPeerServer, {
    //     debug: true
    // });
    // peerApp.use('/peerjs', peerServer);

    // httpPeerServer.listen(process.env.PEER_PORT);

    return { io, httpServer, peerServer };

};

export { ioModule };
