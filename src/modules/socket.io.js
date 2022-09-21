

import { PeerServer } from 'peer';
import { Server, Socket } from 'socket.io';
import dotenv from 'dotenv';
import httpServer from 'http';

// import { Server } from 'socket.io-p2p-server';
// https://dev.to/codesphere/building-a-video-chat-app-with-socket-io-peerjs-codesphere-5a63
// https://stackoverflow.com/questions/21629752/using-node-http-proxy-to-proxy-websocket-connections
// expressjs websocket proxy

// const proxy = httpProxy.createProxyServer({ ws: true });

// import httpProxy from 'http-proxy';
// httpProxy
// .createProxyServer({
//     target: `http://localhost:5501/socket.io`,
//     ws: true,
// })
// .listen(5502);

// RewriteEngine On
// RewriteCond %{REQUEST_URI}  ^/socket.io            [NC]
// RewriteCond %{QUERY_STRING} transport=websocket    [NC]
// # RewriteCond %{HTTP:Upgrade} =websocket [NC]
// RewriteRule /(.*)           ws://www.cyberiaonline.com:3001/$1 [P,L]

dotenv.config();

const ioModule = app => {

    const io = new Server(httpServer.Server(app));
    // io.use(Server);

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


    // // proxy HTTP GET / POST
    // app.get('/socket.io/*', function (req, res) {
    //     // console.log("proxying GET request", req.url);
    //     proxy.web(req, res, { target: 'http://localhost:5500' });
    // });
    // app.post('/socket.io/*', function (req, res) {
    //     // console.log("proxying POST request", req.url);
    //     proxy.web(req, res, { target: 'http://localhost:5500' });
    // });

    // // Proxy websockets
    // app.on('upgrade', function (req, socket, head) {
    //     console.log("proxying upgrade request", req.url);
    //     proxy.ws(req, socket, head);
    // });

    return { io, peerServer };

};

export { ioModule };
