

import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const ioModule = app => {

    const io = new Server(process.env.IO_PORT, {
        cors: {
            origin: `http://localhost:${process.env.PORT}`,
            methods: ['GET', 'POST'],
            //   allowedHeaders: ['my-custom-header'],
            //   credentials: true
        }
    });

    // When someone connects to the server
    io.on('connection', socket => {
        console.log('io connection', socket);
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

    return { io };

};

export { ioModule };