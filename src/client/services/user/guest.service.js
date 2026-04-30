import Dexie from 'dexie';
import { loggerFactory } from '../../components/core/Logger.js';

const logger = loggerFactory(import.meta);

const USER_TOKEN_KEY = 'jwt';
const GUEST_TOKEN_KEY = 'jwt.g';

class SessionMetaDb extends Dexie {
  constructor() {
    super('session-meta-db');
    this.version(1).stores({
      meta: '&key,value,updatedAt',
    });
  }
}

const db = new SessionMetaDb();

class GuestService {
  static setUserToken(value = '') {
    if (value) localStorage.setItem(USER_TOKEN_KEY, value);
    else localStorage.removeItem(USER_TOKEN_KEY);
    return value;
  }

  static getUserToken() {
    return localStorage.getItem(USER_TOKEN_KEY) || '';
  }

  static clearUserToken() {
    localStorage.removeItem(USER_TOKEN_KEY);
    return '';
  }

  static setGuestToken(value = '') {
    if (value) localStorage.setItem(GUEST_TOKEN_KEY, value);
    else localStorage.removeItem(GUEST_TOKEN_KEY);
    return value;
  }

  static getGuestToken() {
    return localStorage.getItem(GUEST_TOKEN_KEY) || '';
  }

  static clearGuestToken() {
    localStorage.removeItem(GUEST_TOKEN_KEY);
    return '';
  }

  static getAuthorizationToken() {
    return this.getUserToken() || this.getGuestToken() || '';
  }

  static getAuthorizationHeader() {
    const token = this.getAuthorizationToken();
    return token ? `Bearer ${token}` : '';
  }

  static async setMeta(key, value) {
    try {
      await db.meta.put({ key, value, updatedAt: Date.now() });
    } catch (error) {
      logger.warn('session meta write failed', { key, error: error?.message });
    }
  }

  static async getMeta(key) {
    try {
      const row = await db.meta.get(key);
      return row ? row.value : null;
    } catch (error) {
      logger.warn('session meta read failed', { key, error: error?.message });
      return null;
    }
  }
}

export { GuestService };
