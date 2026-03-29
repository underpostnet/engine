/**
 * Client-side WebRTC stream manager backed by PeerJS.
 * Handles peer creation, media capture, and room-based A/V streaming.
 *
 * @module client/core/Stream
 * @see https://peerjs.com/docs/
 */

import { loggerFactory } from './Logger.js';
import { getProxyPath } from './Router.js';

const logger = loggerFactory(import.meta);

/**
 * @class Stream
 * @classdesc Static manager for PeerJS connections and MediaStream lifecycle.
 * Supports multiple concurrent peer sessions keyed by an arbitrary `id`.
 */
class Stream {
  /** @type {Object.<string, { peer: Peer, options: Object }>} Active peer sessions keyed by session id. */
  static #sessions = {};

  /**
   * Builds PeerJS connection options from current page location.
   * @returns {{ host: string, port: number, path: string, secure: boolean }}
   */
  static #buildPeerOptions() {
    return {
      host: location.hostname,
      port: location.protocol === 'https:' ? 443 : location.port ? parseInt(location.port) + 1 : 80,
      path: `${getProxyPath()}peer`,
      secure: location.protocol === 'https:',
    };
  }

  /**
   * Creates a PeerJS client for the given session id.
   * @param {string} id - Unique session identifier.
   * @returns {{ peer: Peer, options: Object }} The Peer instance and its options.
   */
  static createPeer(id) {
    this.destroyPeer(id);
    const options = this.#buildPeerOptions();
    logger.info('peerOptions', options);
    const peer = new Peer(undefined, options);
    this.#sessions[id] = { peer, options };
    return this.#sessions[id];
  }

  /**
   * Returns an existing session or `undefined`.
   * @param {string} id
   * @returns {{ peer: Peer, options: Object }|undefined}
   */
  static getSession(id) {
    return this.#sessions[id];
  }

  /**
   * Destroys a peer session — closes all connections and the peer itself.
   * @param {string} id - Session identifier.
   */
  static destroyPeer(id) {
    const session = this.#sessions[id];
    if (!session) return;
    const { peer } = session;
    if (peer) {
      for (const key in peer.connections) {
        for (const conn of peer.connections[key]) {
          if (conn.peerConnection?.close) conn.peerConnection.close();
          if (conn.close) conn.close();
        }
      }
      if (!peer.destroyed) peer.destroy();
    }
    delete this.#sessions[id];
  }

  /**
   * Calls a remote peer and streams local media to them.
   * @param {string} id - Session identifier.
   * @param {string} remotePeerId - The remote peer's ID.
   * @param {MediaStream} localStream - Local media stream to send.
   * @param {Object} [callbacks]
   * @param {function(HTMLMediaElement): void} [callbacks.onStream] - Called when remote stream arrives.
   * @param {function(HTMLMediaElement): void} [callbacks.onClose] - Called when the call closes.
   * @returns {{ call: import('peerjs').MediaConnection, element: HTMLVideoElement }}
   */
  static callPeer(id, remotePeerId, localStream, { onStream, onClose } = {}) {
    const session = this.#sessions[id];
    if (!session) throw new Error(`No peer session "${id}"`);
    const call = session.peer.call(remotePeerId, localStream);
    const element = this.createVideoElement();
    call.on('stream', (remoteStream) => {
      this.attachStream(element, remoteStream);
      onStream?.(element);
    });
    call.on('close', () => onClose?.(element));
    return { call, element };
  }

  // ── Media helpers ────────────────────────────────────────────────

  /**
   * Requests user media (camera / microphone) with graceful fallback.
   * Falls back to video-only if audio is unavailable (NotReadableError).
   * @param {{ video?: boolean|MediaTrackConstraints, audio?: boolean|MediaTrackConstraints }} [constraints]
   * @returns {Promise<MediaStream|undefined>}
   */
  static async getMediaStream(constraints = { video: true, audio: true }) {
    const fallbacks = [
      constraints,
      constraints.audio ? { video: constraints.video, audio: false } : null,
      constraints.video ? { video: false, audio: constraints.audio } : null,
    ].filter(Boolean);

    for (const c of fallbacks) {
      try {
        return await navigator.mediaDevices.getUserMedia(c);
      } catch (err) {
        logger.warn(`getUserMedia failed (${err.name}): ${err.message}`, c);
      }
    }
    logger.error('All media capture attempts failed');
    return undefined;
  }

  /**
   * Stops all tracks of a MediaStream.
   * @param {MediaStream} stream
   */
  static stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }

  /**
   * Creates a `<video>` element pre-configured for inline autoplay.
   * @returns {HTMLVideoElement}
   */
  static createVideoElement() {
    const video = document.createElement('video');
    video.playsInline = true;
    video.autoplay = true;
    return video;
  }

  /**
   * Attaches a MediaStream to a media element and starts playback.
   * @param {HTMLMediaElement} element
   * @param {MediaStream} stream
   * @returns {HTMLMediaElement}
   */
  static attachStream(element, stream) {
    element.srcObject = stream;
    element.addEventListener('loadedmetadata', () => element.play());
    return element;
  }
}

export { Stream };
