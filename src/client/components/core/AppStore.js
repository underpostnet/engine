/**
 * Core per-app state store for WebSocket channel data.
 *
 * @module client/core/AppStore
 * @namespace AppStore
 */

/**
 * @class AppStore
 * @classdesc Per-app singleton state store for WebSocket channel data and authenticated user state.
 *
 * Usage: `AppStoreX.Data.user.main.model.user` — the authenticated user object.
 * `AppStoreX.Data` keys (`chat`, `mailer`, `stream`, etc.) — channel definitions for `SocketIo.Init`.
 * @memberof AppStore
 */
class AppStore {
  /**
   * Channel data map, keyed by channel name (e.g. `user`, `chat`, `mailer`).
   * The `user` channel always contains `{ main: { model: { user: { _id: '' } } } }`.
   *
   * @type {Object.<string, Object>}
   */
  Data;

  /** @private @type {function(): Object} */
  #initialStateFactory;

  /**
   * Creates a new AppStore instance.
   *
   * @param {function(): Object} initialStateFactory - Factory function returning the initial data shape.
   *   Must return at least `{ user: { main: { model: { user: { _id: '' } } } } }`.
   */
  constructor(initialStateFactory) {
    this.#initialStateFactory = initialStateFactory;
    this.Data = initialStateFactory();
  }

  /**
   * Resets `Data` to its initial state.
   *
   * @returns {void}
   */
  reset() {
    this.Data = this.#initialStateFactory();
  }

  /**
   * Creates an AppStore with the standard channel layout.
   * Always includes `user`, `chat`, and `mailer` channels.
   *
   * @static
   * @param {...string} extraChannels - Additional channel names (e.g. `'stream'`).
   * @returns {AppStore}
   */
  static create(...extraChannels) {
    return new AppStore(() => {
      const state = {
        user: { main: { model: { user: { _id: '' } } } },
        chat: {},
        mailer: {},
      };
      for (const ch of extraChannels) state[ch] = {};
      return state;
    });
  }
}

export { AppStore };
