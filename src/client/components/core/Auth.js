/**
 * Utility class for authentication state management and session lifecycle control.
 * This class is designed to be used as a singleton instance (exported as 'Auth').
 * @module src/client/components/core/Auth.js
 * @namespace AuthClient
 */

import { UserMock, UserService } from '../../services/user/user.service.js';
import { Account } from './Account.js';
import { loggerFactory } from './Logger.js';
import { LogIn } from './LogIn.js';
import { LogOut } from './LogOut.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta, { trace: true });

/**
 * Manages user authentication state, tokens, and session lifecycle.
 * @memberof AuthClient
 */
class Auth {
  /**
   * The current user access token (JWT).
   * @type {string}
   * @private
   */
  #token = '';

  /**
   * The token for anonymous guest sessions.
   * @type {string}
   * @private
   */
  #guestToken = '';

  /**
   * Timeout ID for the token refresh schedule.
   * @type {number | undefined}
   * @private
   */
  #refreshTimeout;

  /**
   * Creates an instance of Auth.
   */
  constructor() {
    // Private fields are initialized above.
  }

  // --- Token Management ---

  /**
   * Sets the user's access token.
   * @memberof AuthClient.Auth
   * @param {string} [value=''] - The JWT token value.
   * @returns {string} The set token value.
   */
  setToken(value = '') {
    return (this.#token = value);
  }

  /**
   * Clears the user's access token.
   * @memberof AuthClient.Auth
   * @returns {string} An empty string.
   */
  deleteToken() {
    return (this.#token = '');
  }

  /**
   * Gets the user's access token.
   * @memberof AuthClient.Auth
   * @returns {string} The JWT token.
   */
  getToken() {
    return this.#token;
  }

  /**
   * Sets the anonymous guest token.
   * @memberof AuthClient.Auth
   * @param {string} [value=''] - The guest token value.
   * @returns {string} The set guest token value.
   */
  setGuestToken(value = '') {
    return (this.#guestToken = value);
  }

  /**
   * Clears the anonymous guest token.
   * @memberof AuthClient.Auth
   * @returns {string} An empty string.
   */
  deleteGuestToken() {
    return (this.#guestToken = '');
  }

  /**
   * Gets the anonymous guest token.
   * @memberof AuthClient.Auth
   * @returns {string} The guest token.
   */
  getGuestToken() {
    return this.#guestToken;
  }

  /**
   * Generates the JWT header string (e.g., "Bearer [token]") using the active token (user or guest).
   * @memberof AuthClient.Auth
   * @returns {string} The Bearer token string or an empty string.
   */
  getJWT() {
    if (this.getToken()) return `Bearer ${this.getToken()}`;
    if (this.getGuestToken()) return `Bearer ${this.getGuestToken()}`;
    return '';
  }

  /**
   * Decodes the payload section of a JWT token.
   * @static
   * @memberof AuthClient.Auth
   * @param {string} token - The JWT string.
   * @returns {object | null} The decoded JWT payload object, or null on failure.
   */
  static decodeJwt(token) {
    try {
      // Uses atob for base64 decoding of the middle part of the JWT
      return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
      logger.error('Failed to decode JWT:', e);
      return null;
    }
  }

  // --- Session Management ---

  /**
   * Schedules the access token to be refreshed shortly before it expires.
   * Clears any existing refresh timeout before setting a new one.
   * @memberof AuthClient.Auth
   * @returns {void}
   */
  scheduleTokenRefresh() {
    if (this.#refreshTimeout) {
      clearTimeout(this.#refreshTimeout);
      this.#refreshTimeout = undefined;
    }

    const currentToken = this.getToken();
    if (!currentToken) return;

    const payload = Auth.decodeJwt(currentToken);
    if (!payload || !payload.refreshExpiresAt) return; // Requires refreshExpiresAt in milliseconds

    const expiresIn = payload.refreshExpiresAt - Date.now();
    const refreshBuffer = 2 * 60 * 1000; // 2 minutes buffer before expiry
    const refreshIn = expiresIn - refreshBuffer;

    logger.info(`Token refresh scheduled in ${refreshIn / (1000 * 60)} minutes`);

    if (refreshIn <= 0) {
      logger.warn('Token already expired or too close to expiry, skipping refresh schedule.');
      return;
    }

    this.#refreshTimeout = setTimeout(async () => {
      const { data, status } = await UserService.get({ id: 'auth' }); // API call to get a fresh token
      if (status === 'success' && data?.token) {
        logger.info('Successfully refreshed access token.');
        this.setToken(data.token);
        localStorage.setItem('jwt', data.token);
        this.scheduleTokenRefresh(); // Schedule the next refresh
      } else {
        logger.warn('Token refresh failed, attempting session out.');
        this.sessionOut();
      }
    }, refreshIn);
  }

  /**
   * Establishes a user session (logged-in) or falls back to a guest session.
   * It attempts to use the provided token or a token from localStorage ('jwt').
   * @memberof AuthClient.Auth
   * @param {object} [userServicePayload] - Payload from a successful login/signup call to UserService.
   * @returns {Promise<{user: object}>} A promise resolving to the current user object.
   */
  async sessionIn(userServicePayload) {
    try {
      let token = userServicePayload?.data?.token || localStorage.getItem('jwt');

      if (token) {
        this.setToken(token);

        const result = userServicePayload
          ? userServicePayload // From login/signup
          : await UserService.get({ id: 'auth' }); // Verify token with backend

        const { status, data, message } = result;

        if (status === 'success' && data.token) {
          // A valid user token was found/refreshed
          this.setToken(data.token);
          localStorage.setItem('jwt', data.token);
          this.renderSessionUI();
          await LogIn.Trigger({ user: data.user });
          await Account.updateForm(data.user);
          this.scheduleTokenRefresh();
          return { user: data.user };
        } else if (message && message.match('expired')) {
          logger.warn('User session token expired.');
          // Redirect to login modal and push notification
          setTimeout(() => {
            s(`.main-btn-log-in`).click();
            NotificationManager.Push({
              html: Translate.Render(`expired-session`),
              status: 'warning',
            });
          });
        }
      }

      // Cleanup failed user session attempt
      this.deleteToken();
      localStorage.removeItem('jwt');

      // Anon guest session attempt
      let guestToken = localStorage.getItem('jwt.g');
      if (guestToken) {
        this.setGuestToken(guestToken);
        let { data, status, message } = await UserService.get({ id: 'auth' }); // Verify guest token
        if (status === 'success' && data.token) {
          // Guest token is valid and refreshed
          this.setGuestToken(data.token);
          localStorage.setItem('jwt.g', data.token);
          await LogIn.Trigger(data);
          await Account.updateForm(data.user);
          return data;
        } else {
          logger.error(`Guest token validation failed: ${message}`);
          // Fall through to full sessionOut to re-create guest session
        }
      }

      // If all attempts fail, create a new guest session (which calls sessionIn recursively)
      return await this.sessionOut();
    } catch (error) {
      logger.error('Error during sessionIn process:', error);
      // Fallback to a mock user object
      return { user: UserMock.default };
    }
  }

  /**
   * Ends the current user session (logout) and initiates a new anonymous guest session.
   * @memberof AuthClient.Auth
   * @returns {Promise<object>} A promise resolving to the newly created guest session data.
   */
  async sessionOut() {
    // 1. End User Session
    try {
      const result = await UserService.delete({ id: 'logout' });
      localStorage.removeItem('jwt');
      this.deleteToken();
      if (this.#refreshTimeout) {
        clearTimeout(this.#refreshTimeout);
        this.#refreshTimeout = undefined;
      }
      this.renderGuestUi();
      // Reset user data in the LogIn state/model
      LogIn.Scope.user.main.model.user = {};
      await LogOut.Trigger(result);
    } catch (error) {
      logger.error('Error during user logout:', error);
    }

    // 2. Start Guest Session
    try {
      localStorage.removeItem('jwt.g');
      this.deleteGuestToken();
      const result = await UserService.post({ id: 'guest' }); // Request a new guest token

      if (result.status === 'success' && result.data.token) {
        localStorage.setItem('jwt.g', result.data.token);
        this.setGuestToken(result.data.token);
        // Recursively call sessionIn to complete the guest login process (UI update, etc.)
        return await this.sessionIn();
      } else {
        logger.error('Failed to get a new guest token.');
        return { user: UserMock.default };
      }
    } catch (error) {
      logger.error('Error during guest session creation:', error);
      return { user: UserMock.default };
    }
  }

  // --- UI Rendering ---

  /**
   * Renders the UI for a logged-in user (hides Log In/Sign Up, shows Log Out/Account).
   * Also closes any active login/signup modals.
   * @memberof AuthClient.Auth
   * @returns {void}
   */
  renderSessionUI() {
    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;
    setTimeout(() => {
      // Close any open login/signup modals
      if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
      if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
    });
  }

  /**
   * Renders the UI for a guest user (shows Log In/Sign Up, hides Log Out/Account).
   * Also closes any active logout/account modals.
   * @memberof AuthClient.Auth
   * @returns {void}
   */
  renderGuestUi() {
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-account`).style.display = 'none';
    setTimeout(() => {
      // Close any open logout/account modals
      if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();
      if (s(`.modal-account`)) s(`.btn-close-modal-account`).click();
    });
  }
}

// Export a singleton instance of the Auth class to maintain the original utility object access pattern.
const AuthSingleton = new Auth();

export { AuthSingleton as Auth };
