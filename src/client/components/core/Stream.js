import { loggerFactory } from './Logger.js';
import { getProxyPath } from './Router.js';

// https://peerjs.com/docs/

const logger = loggerFactory(import.meta);

const Stream = {
  Data: {},
  createPeerServer: function ({ id }) {
    const peerOptions = {
      host: location.hostname, // '/'
      port: location.protocol === 'https:' ? 443 : location.port ? parseInt(location.port) + 1 : 80,
      path: `${getProxyPath()}peer`,
      secure: location.protocol === 'https:',
    };
    logger.info('peerOptions', peerOptions);
    this.Data[id] = {
      peer: {
        peerOptions,
        server: new Peer(undefined, peerOptions),
      },
    };
    return this.Data[id].peer;
  },
  connectToNewUser: function (
    mediaType,
    id,
    userId,
    stream,
    onConnectStream = (mediaElement) => null,
    onDisconnectStream = (mediaElement) => null,
  ) {
    // This runs when someone joins our room
    const call = this.Data[id].peer.server.call(userId, stream); // Call the user who just joined
    const mediaElement = this.createMediaElement(mediaType);

    call.on('stream', (userMediaStream) => {
      onConnectStream(this.renderElementStream(mediaElement, userMediaStream));
    });
    // If they leave, remove their video
    call.on('close', () => {
      onDisconnectStream(mediaElement);
    });
    return { call, mediaElement };
  },
  handlePeerDisconnect({ id }) {
    // manually close the peer connections
    for (let conns in this.Data[id].peer.server.connections) {
      this.Data[id].peer.server.connections[conns].forEach((conn, index, array) => {
        console.log(`closing ${conn.connectionId} peerConnection (${index + 1}/${array.length})`, conn.peerConnection);
        if (conn.peerConnection && conn.peerConnection.close) conn.peerConnection.close();

        // close it using peerjs methods
        if (conn.close) conn.close();
      });
    }
  },
  renderElementStream: function (mediaElement, stream) {
    mediaElement.srcObject = stream;
    mediaElement.addEventListener('loadedmetadata', () => {
      // Play the video as it loads
      mediaElement.play();
    });
    return mediaElement;
    // use example:
    // videoGrid.append(mediaElement); // Append video element to videoGrid
  },
  // Access the user's video and audio
  getMediaStream: function (
    options = {
      video: true,
      audio: true,
    },
  ) {
    return new Promise((resolve) => {
      navigator.mediaDevices
        .getUserMedia(options)
        .then((stream) => resolve(stream))
        .catch((error) => {
          logger.error(error);
          resolve(undefined);
        });
    });
  },
  removeMediaStream: function (stream) {
    // later you can do below
    // stop both video and audio
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    // stop only audio
    // stream.getAudioTracks()[0].stop();
    // stop only video
    // stream.getVideoTracks()[0].stop();
  },
  createMediaElement: function (mediaType) {
    let mediaElement;
    switch (mediaType) {
      case 'audio-video':
        mediaElement = document.createElement('video'); // Create a new audio/video tag to show our audio/video
        // mediaElement.muted = true; // Mute ourselves on our end so there is no feedback loop

        break;

      default:
        break;
    }
    return mediaElement;
  },
};

export { Stream };
