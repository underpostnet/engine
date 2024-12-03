import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { SocketIo } from '../core/SocketIo.js';
import { Stream } from '../core/Stream.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';

const StreamHealthcare = {
  Render: async function (
    options = {
      idModal: 'modal-stream',
    },
  ) {
    setTimeout(async () => {
      const id = 'stream-healthcare';
      const mediaType = 'audio-video';
      const ROOM_ID = 'test-room';
      const peer = Stream.createPeerServer({ id }).server;
      const channel = 'stream';
      let myPeerId;

      Modal.Data[options.idModal].onCloseListener[id] = () => {
        if (stream) Stream.removeMediaStream(stream);
        Stream.handlePeerDisconnect({ id });
      };

      const myMediaElement = Stream.createMediaElement(mediaType);

      peer.on('open', (peerId) => {
        // When we first open the app, have us join a room
        myPeerId = peerId;
        console.warn('on my peer open', peerId);
        SocketIo.socket.emit('stream', ROOM_ID, peerId);
      });

      const stream = await Stream.getMediaStream();

      if (!stream)
        return NotificationManager.Push({
          html: Translate.Render('no-can-connect-stream-device'),
          status: 'warning',
        });

      s(`.media-stream-grid`).append(Stream.renderElementStream(myMediaElement, stream)); // Display our audio/video to ourselves

      peer.on('call', (call) => {
        console.warn('on receive peer call');
        // When we join someone's room we will receive a call from them
        call.answer(stream); // Stream them our video/audio
        const mediaElement = Stream.createMediaElement(mediaType);
        call.on('stream', (userMediaStream) => {
          console.warn('on receive peer stream');
          // When we recieve their stream
          // Display their audio/video to ourselves
          s(`.media-stream-grid`).append(Stream.renderElementStream(mediaElement, userMediaStream));
        });
        call.on('close', (call) => {
          console.warn('on receive peer close');
          // Stream.handlePeerDisconnect();
          // call.close();
        });
      });

      peer.on('close', (...args) => {
        console.warn('on receive peer close', args);
      });

      const userJoin = {};

      SocketIo.socket.on(`${channel}-user-connected`, (userId) => {
        // If a new user connect
        console.warn(`${channel} user connected`, userId);

        const { call, mediaElement } = Stream.connectToNewUser(
          mediaType,
          id,
          userId,
          stream,
          (mediaElement) => {
            // connect peer stream
            console.warn(`connect peer stream`, userId);
            s(`.media-stream-grid`).append(mediaElement);
          },
          (mediaElement) => {
            // disconnected peer stream
            console.warn(`disconnected peer stream`, userId);
            // s(`.media-stream-grid`).removeChild(mediaElement);
            mediaElement.remove();
          },
        );
        userJoin[userId] = { mediaElement };
        // call.close();
      });

      SocketIo.socket.on(`${channel}-user-disconnected`, (userId) => {
        // If a user disconnected
        console.warn(`${channel} user disconnected`, userId);
        if (userJoin[userId]) {
          userJoin[userId].mediaElement.remove();
          delete userJoin[userId];
        }
      });
    });
    return html`<div class="in media-stream-grid"></div>`;
  },
};

export { StreamHealthcare };
