/**
 * Server-side management state for the mailer WebSocket channel.
 * Maintains a bidirectional mapping between socket IDs and user IDs,
 * enabling O(1) lookup for targeted real-time pushes (e.g. email confirmation).
 *
 * @module ws/core/management/core.ws.mailer
 * @namespace CoreWsMailerManagement
 */

const CoreWsMailerManagement = {
  /** @type {Object.<string, Object.<string, { model: { user: Object } }>>} Socket data keyed by `[wsManagementId][socketId]`. */
  element: {},
  /** @type {Object.<string, Object.<string, string>>} Reverse index keyed by `[wsManagementId][userId]` → socketId. */
  _userIndex: {},
  /**
   * Initializes the management context for a given server instance.
   *
   * @param {string} wsManagementId - Unique identifier (`${host}${path}`).
   * @returns {void}
   */
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this._userIndex[wsManagementId] = {};
  },
  /**
   * Registers a user↔socket mapping.
   *
   * @param {string} wsManagementId - Management context ID.
   * @param {string} socketId - The socket ID.
   * @param {Object} user - The user data to associate.
   * @returns {void}
   */
  setUser: function (wsManagementId, socketId, user) {
    this.element[wsManagementId][socketId] = { model: { user } };
    if (user && user._id) {
      this._userIndex[wsManagementId][user._id.toString()] = socketId;
    }
  },
  /**
   * Removes a socket entry and its reverse index.
   *
   * @param {string} wsManagementId - Management context ID.
   * @param {string} socketId - The socket ID to remove.
   * @returns {void}
   */
  removeSocket: function (wsManagementId, socketId) {
    const entry = this.element[wsManagementId]?.[socketId];
    if (entry?.model?.user?._id) {
      delete this._userIndex[wsManagementId][entry.model.user._id.toString()];
    }
    delete this.element[wsManagementId]?.[socketId];
  },
  /**
   * Finds the socket ID associated with a user ID (O(1) via reverse index).
   *
   * @param {string} wsManagementId - Management context ID.
   * @param {string} id - The user `_id` to look up.
   * @returns {string|undefined} The socket ID, or `undefined` if the user is not connected.
   */
  getUserWsId: function (wsManagementId = '', id = '') {
    return this._userIndex[wsManagementId]?.[id];
  },
};

export { CoreWsMailerManagement };
