import { Modal } from '../core/Modal.js';
import { SocketIo } from '../core/SocketIo.js';
import { Stream } from '../core/Stream.js';
import { s } from '../core/VanillaJs.js';

const StreamNexodev = {
  Render: async function (
    options = {
      idModal: 'modal-stream',
    },
  ) {
    setTimeout(async () => {
      const id = 'stream-nexodev';
      const mediaType = 'audio-video';
      const ROOM_ID = 'test-room';
      const peer = Stream.createPeerServer({ id }).server;
      const channel = 'stream';

      Modal.Data[options.idModal].onCloseListener[id] = () => {
        Stream.removeMediaStream(stream);
        Stream.handlePeerDisconnect({ id });
      };

      const myMediaElement = Stream.createMediaElement(mediaType);

      peer.on('open', (peerId) => {
        // When we first open the app, have us join a room
        SocketIo.socket.emit('stream', ROOM_ID, peerId);
      });

      const stream = await Stream.getMediaStream();

      s(`.media-stream-grid`).append(Stream.renderElementStream(myMediaElement, stream)); // Display our audio/video to ourselves

      peer.on('call', (call) => {
        // When we join someone's room we will receive a call from them
        call.answer(stream); // Stream them our video/audio
        const mediaElement = Stream.createMediaElement(mediaType);
        call.on('stream', (userMediaStream) => {
          // When we recieve their stream
          // Display their audio/video to ourselves
          s(`.media-stream-grid`).append(Stream.renderElementStream(mediaElement, userMediaStream));
        });
        call.on('close', (call) => {
          console.warn('my peer close');
          // Stream.handlePeerDisconnect();
          // call.close();
        });
      });

      const userJoin = {};

      SocketIo.socket.on(`${channel}-user-connected`, (userId) => {
        // If a new user connect

        const { call, mediaElement } = Stream.connectToNewUser(
          mediaType,
          id,
          userId,
          stream,
          (mediaElement) => {
            // connect peer stream
            s(`.media-stream-grid`).append(mediaElement);
          },
          (mediaElement) => {
            // disconnected peer stream
            // s(`.media-stream-grid`).removeChild(mediaElement);
            mediaElement.remove();
          },
        );
        userJoin[userId] = { mediaElement };
        // call.close();
      });

      SocketIo.socket.on(`${channel}-user-disconnected`, (userId) => {
        // If a user disconnected
        console.warn('user disconnected');
        userJoin[userId].mediaElement.remove();
      });
    });
    return html`<div class="in media-stream-grid"></div>`;
  },
};

export { StreamNexodev };
