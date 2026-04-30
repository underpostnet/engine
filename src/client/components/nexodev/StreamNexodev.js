import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { SocketIo } from '../core/SocketIo.js';
import { Stream } from '../core/Stream.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';

class StreamNexodev {
  static async Render(
    options = {
      idModal: 'modal-stream',
    },
  ) {
    setTimeout(async () => {
      const id = 'stream-nexodev';
      const ROOM_ID = 'test-room';
      const { peer } = Stream.createPeer(id);
      const channel = 'stream';
      let myPeerId;

      Modal.Data[options.idModal].onCloseListener[id] = () => {
        if (stream) Stream.stopStream(stream);
        Stream.destroyPeer(id);
      };

      peer.on('open', (peerId) => {
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

      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;

      if (!hasVideo)
        NotificationManager.Push({
          html: `Camera unavailable — ${hasAudio ? 'audio only' : 'no media tracks'}`,
          status: 'warning',
        });

      const myVideo = Stream.createVideoElement();
      myVideo.muted = true;
      if (!hasVideo) myVideo.style.display = 'none';
      s(`.media-stream-grid`).append(Stream.attachStream(myVideo, stream));

      peer.on('call', (call) => {
        call.answer(stream);
        const remoteVideo = Stream.createVideoElement();
        let remotePeerId = call.peer;
        call.on('stream', (remoteStream) => {
          s(`.media-stream-grid`).append(Stream.attachStream(remoteVideo, remoteStream));
          // Track the element for this peer
          userJoin[remotePeerId] = { element: remoteVideo };
        });
        call.on('close', () => {
          remoteVideo.remove();
          if (userJoin[remotePeerId]) delete userJoin[remotePeerId];
        });
      });

      peer.on('close', (...args) => {
        console.warn('on receive peer close', args);
      });

      const userJoin = {};

      SocketIo.socket.on(`${channel}-existing-users`, (userIds) => {
        console.warn(`${channel} existing users`, userIds);
        for (const userId of userIds) {
          if (userId === myPeerId) continue;
          const { call } = Stream.callPeer(id, userId, stream, {
            onStream: (el) => {
              s(`.media-stream-grid`).append(el);
              userJoin[userId] = { element: el };
            },
            onClose: (el) => {
              el.remove();
              if (userJoin[userId]) delete userJoin[userId];
            },
          });
        }
      });

      SocketIo.socket.on(`${channel}-user-connected`, (userId) => {
        console.warn(`${channel} user connected`, userId);
        const { call } = Stream.callPeer(id, userId, stream, {
          onStream: (el) => {
            s(`.media-stream-grid`).append(el);
            userJoin[userId] = { element: el };
          },
          onClose: (el) => {
            el.remove();
            if (userJoin[userId]) delete userJoin[userId];
          },
        });
      });

      SocketIo.socket.on(`${channel}-user-disconnected`, (userId) => {
        console.warn(`${channel} user disconnected`, userId);
        if (userJoin[userId]) {
          userJoin[userId].element.remove();
          delete userJoin[userId];
        }
      });
    });
    return html`<div class="in media-stream-grid"></div>`;
  }
}

export { StreamNexodev };
