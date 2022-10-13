

import { Server } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';

dotenv.config();


const ioModule = (app, options) => {

    const httpServer = createServer({}, app);
    /**/
    const io = new Server(httpServer, {
        cors: {
            // origin: `http://localhost:${process.env.PORT}`,
            origins: options.origin,
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

    return { io, httpServer };

};

export { ioModule };
