

import { Server } from 'socket.io';
import { createServer } from "http";
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const httpServer = createServer(process.env.NODE_ENV == 'development' || process.argv[2] == 'build' ? undefined : {
    key: fs.readFileSync("C:/dd/virtual_machine/SSL/cyberiaonline/cyberiaonline.com-key.pem"),
    cert: fs.readFileSync("C:/dd/virtual_machine/SSL/cyberiaonline/cyberiaonline.com-crt.pem"),
    requestCert: true,
    ca: [
        fs.readFileSync("C:/dd/virtual_machine/SSL/cyberiaonline/cyberiaonline.com-chain.pem")
    ]
});


const ioModule = app => {

    const io = new Server(httpServer, {
        cors: {
            // origin: `http://localhost:${process.env.PORT}`,
            origins: process.env.NODE_ENV == 'development' ?
                [`http://localhost:${process.env.PORT}`, 'http://localhost:3001'] :
                [`https://www.cyberiaonline.com`, 'https://underpost.net', `http://www.cyberiaonlibe.com:${process.env.IO_PORT}`],
            methods: ['GET', 'POST'],
            // allowedHeaders: ['Access-Control-Allow-Origin'],
            credentials: true
        }
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

    httpServer.listen(process.env.IO_PORT);

    return { io, httpServer };

};

export { ioModule };
