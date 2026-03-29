/**
 * Core per-app state store for WebSocket channel data.
 * Each app instantiates an `AppStore` with its own `BaseElement` factory
 * that defines the initial channel data shape (e.g. `{ user, chat, mailer, stream }`).
 *
 * @module client/core/AppStore
 * @namespace AppStore
 */

/**
 * @class AppStore
 * @classdesc Per-app singleton state store for WebSocket channel data and authenticated user state.
 * Each app provides a `BaseElement` factory defining the channel shape.
 *
 * Usage: `ElementsX.Data.user.main.model.user` — the authenticated user object.
 * `ElementsX.Data` keys (`chat`, `mailer`, `stream`, etc.) — channel definitions for `SocketIo.Init`.
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

  /**
   * The factory function that produces the initial data shape.
   *
   * @private
   * @type {function(): Object}
   */
  #baseElementFactory;

  /**
   * Creates a new AppStore instance.
   *
   * @param {function(): Object} baseElementFactory - Factory function returning the initial data shape.
   *   Must return at least `{ user: { main: { model: { user: { _id: '' } } } } }`.
   */
  constructor(baseElementFactory) {
    this.#baseElementFactory = baseElementFactory;
    this.Data = baseElementFactory();
  }

  /**
   * Resets `Data` to its initial state.
   *
   * @returns {void}
   */
  reset() {
    this.Data = this.#baseElementFactory();
  }
}

export { AppStore };
