

import { PeerServer } from 'peer';
import { Server, Socket } from 'socket.io';
import dotenv from 'dotenv';
import httpServer from 'http';

dotenv.config();

const ioModule = app => {

    const io = new Server(httpServer.Server(app));

    io.on('connection', socket => {
        socket.on('join-room', (roomid, peerid, type) => {
            socket.join(roomid);
            // socket.to(roomid).broadcast.emit(type === 1 ? "sender-connected" : "receiver-connected", peerid);
            socket.to(roomid).emit(type === 1 ? "sender-connected" : "receiver-connected", peerid);

            socket.on('disconnect', () => {
                // socket.to(roomid).broadcast.emit(type === 1 ? "sender-disconnected" : "receiver-disconnected", peerid);
                socket.to(roomid).emit(type === 1 ? "sender-disconnected" : "receiver-disconnected", peerid);
            });
        });
    });

    const peerServer = PeerServer({
        port: process.env.PEER_PORT
        // ssl: {
        //     key: fs.readFileSync((data.sslKeyPath)),
        //     cert: fs.readFileSync((data.sslCertPath)),
        //     ca: fs.readFileSync((data.sslCaPath))
        // }
    });

    return { io, peerServer };

};

export { ioModule };
