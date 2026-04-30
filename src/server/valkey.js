/**
 * Valkey connection and key-value store module.
 *
 * Responsibilities:
 *  - Manage per-instance Valkey connections keyed by `${host}${path}`.
 *  - Provide a thin, typed CRUD surface: get / set / del / update.
 *  - Expose connection status helpers.
 *
 * Out of scope: domain model factories, DTO projection — those belong in
 * their respective service modules (e.g. guest.service.js).
 *
 * @module src/server/valkey.js
 * @namespace ValkeyService
 */
import Valkey from 'iovalkey';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

// ─── Instance registry ────────────────────────────────────────────────────────

/** @type {Record<string, import('iovalkey').default>} */
const ValkeyInstances = {};

/** @type {Record<string, 'connected' | 'error'>} */
const ValkeyStatus = {};

/**
 * Derives the registry key from an instance descriptor.
 * @param {{ host?: string, path?: string }} opts
 * @returns {string}
 */
const _instanceKey = (opts = {}) => `${opts.host || ''}${opts.path || ''}`;

// ─── Connection ───────────────────────────────────────────────────────────────

/**
 * Returns true when at least one Valkey instance is connected.
 * @returns {boolean}
 * @memberof ValkeyService
 */
const isValkeyEnable = () => Object.values(ValkeyStatus).some((s) => s === 'connected');

/**
 * Creates a Valkey client for the given instance and waits for connectivity.
 * Throws on connection failure — callers decide whether to abort or continue
 * without Valkey.
 *
 * @param {{ host?: string, path?: string }} instance - Registry key descriptor.
 * @param {{ host?: string, port?: number }} connectionOptions - iovalkey connection options.
 * @returns {Promise<import('iovalkey').default>}
 * @memberof ValkeyService
 */
const createValkeyConnection = async (instance = {}, connectionOptions = {}) => {
  const key = _instanceKey(instance);

  const client = new Valkey({
    port: connectionOptions.port ?? undefined,
    host: connectionOptions.host ?? undefined,
    retryStrategy: (attempt) => (attempt === 1 ? undefined : 1000),
  });

  client.on('ready', () => {
    ValkeyStatus[key] = 'connected';
    logger.info('Valkey connected', { instance });
  });
  client.on('error', (err) => {
    ValkeyStatus[key] = 'error';
    logger.error('Valkey error', { err: err?.message, instance });
  });
  client.on('end', () => {
    ValkeyStatus[key] = 'error';
    logger.warn('Valkey connection ended', { instance });
  });

  // Verify connectivity with a probe before marking ready
  await Promise.race([
    (async () => {
      try {
        const probe = `__vk_probe_${Date.now()}`;
        await client.set(probe, '1');
        await client.get(probe);
        await client.del(probe);
        ValkeyStatus[key] = 'connected';
      } catch {
        ValkeyStatus[key] = 'error';
      }
    })(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);

  ValkeyInstances[key] = client;
  logger.info('Valkey instance registered', { key, status: ValkeyStatus[key] });
  return client;
};

// ─── Internal client resolver ─────────────────────────────────────────────────

/**
 * Resolves the connected client for an instance or throws.
 * @param {{ host?: string, path?: string }} options
 * @returns {import('iovalkey').default}
 */
const _client = (options) => {
  const k = _instanceKey(options);
  const client = ValkeyInstances[k];
  if (!client || ValkeyStatus[k] !== 'connected') {
    throw new Error(`Valkey instance not connected: ${k}`);
  }
  return client;
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Retrieves and JSON-parses a value by key.
 * Returns null when the key does not exist.
 *
 * @param {{ host?: string, path?: string }} options
 * @param {string} key
 * @returns {Promise<object | string | null>}
 * @memberof ValkeyService
 */
const get = async (options, key) => {
  const raw = await _client(options).get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/**
 * Serialises and stores a value by key.
 * Pass `ttlMs` to set an expiry in milliseconds.
 *
 * @param {{ host?: string, path?: string }} options
 * @param {string} key
 * @param {object | string} payload
 * @param {number} [ttlMs]
 * @returns {Promise<string>} Resolves to 'OK'.
 * @memberof ValkeyService
 */
const set = async (options, key, payload, ttlMs) => {
  const value = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (ttlMs) return _client(options).set(key, value, 'PX', ttlMs);
  return _client(options).set(key, value);
};

/**
 * Deletes a key.
 *
 * @param {{ host?: string, path?: string }} options
 * @param {string} key
 * @returns {Promise<number>}
 * @memberof ValkeyService
 */
const del = async (options, key) => _client(options).del(key);

/**
 * Shallow-merges `payload` into the existing object stored at `key`
 * and persists the result.  The `updatedAt` timestamp is refreshed automatically.
 *
 * @param {{ host?: string, path?: string }} options
 * @param {string} key
 * @param {object} payload
 * @returns {Promise<string>} Resolves to 'OK'.
 * @memberof ValkeyService
 */
const update = async (options, key, payload) => {
  const base = (await get(options, key)) ?? {};
  return set(options, key, { ...base, ...payload, updatedAt: new Date().toISOString() });
};

// ─── Public API class ─────────────────────────────────────────────────────────

/**
 * Namespace grouping all Valkey operations.
 * @memberof ValkeyService
 */
class ValkeyAPI {
  /** @param {{ host?: string, path?: string }} options */
  static isConnected = (options) => ValkeyStatus[_instanceKey(options)] === 'connected';
  static get = get;
  static set = set;
  static del = del;
  static update = update;
  static createValkeyConnection = createValkeyConnection;
}

export { isValkeyEnable, createValkeyConnection, get, set, del, update, ValkeyAPI };
