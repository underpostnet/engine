/**
 * Module for managing Valkey
 * @module src/server/valkey.js
 * @namespace ValkeyService
 */

import Valkey from 'iovalkey';
import mongoose from 'mongoose';
import { hashPassword } from './auth.js';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

// Per-instance registries keyed by `${host}${path}`
const ValkeyInstances = {};
const DummyStores = {}; // in-memory Maps per instance
const ValkeyStatus = {}; // 'connected' | 'dummy' | 'error' | undefined

/**
 * Checks if any Valkey instance is connected.
 * This is a backward-compatible overall flag.
 * @returns {boolean} True if any instance has a 'connected' status.
 * @memberof ValkeyService
 */
const isValkeyEnable = () => Object.values(ValkeyStatus).some((s) => s === 'connected');

/**
 * Generates a unique key for a Valkey instance based on its host and path.
 * @param {object} [opts={ host: '', path: '' }] - The instance options.
 * @param {string} [opts.host=''] - The host of the instance.
 * @param {string} [opts.path=''] - The path of the instance.
 * @returns {string} The instance key.
 * @private
 * @memberof ValkeyService
 */
const _instanceKey = (opts = { host: '', path: '' }) => `${opts.host || ''}${opts.path || ''}`;

/**
 * Creates and manages a connection to a Valkey server for a given instance.
 * It sets up a client, attaches event listeners for connection status, and implements a fallback to an in-memory dummy store if the connection fails.
 * @param {object} [instance={ host: '', path: '' }] - The instance identifier.
 * @param {string} [instance.host=''] - The host of the instance.
 * @param {string} [instance.path=''] - The path of the instance.
 * @param {object} [valkeyServerConnectionOptions={ host: '', path: '' }] - Connection options for the iovalkey client.
 * @returns {Promise<Valkey|undefined>} A promise that resolves to the Valkey client instance, or undefined if creation fails.
 * @memberof ValkeyService
 */
const createValkeyConnection = async (
  instance = { host: '', path: '' },
  valkeyServerConnectionOptions = { host: '', path: '' },
) => {
  const key = _instanceKey(instance);
  // Initialize dummy store for the instance
  if (!DummyStores[key]) DummyStores[key] = new Map();

  try {
    const client = await ValkeyAPI.valkeyClientFactory(valkeyServerConnectionOptions);

    // Attach listeners for visibility
    client.on?.('ready', () => {
      ValkeyStatus[key] = 'connected';
      logger.info('Valkey connected', { instance, status: ValkeyStatus[key] });
    });
    client.on?.('error', (err) => {
      // Switch to dummy if not yet connected
      if (ValkeyStatus[key] !== 'connected') {
        ValkeyStatus[key] = 'dummy';
      } else {
        ValkeyStatus[key] = 'error';
      }
      logger.warn('Valkey error', { err: err?.message, instance, status: ValkeyStatus[key] });
    });
    client.on?.('end', () => {
      if (ValkeyStatus[key] !== 'dummy') ValkeyStatus[key] = 'error';
      logger.warn('Valkey connection ended', { instance, status: ValkeyStatus[key] });
    });

    // Probe connectivity with a short timeout
    const probe = async () => {
      try {
        // basic ping via SET/GET roundtrip
        const probeKey = `__vk_probe_${Date.now()}`;
        await client.set(probeKey, '1');
        await client.get(probeKey);
        ValkeyStatus[key] = 'connected';
      } catch (e) {
        ValkeyStatus[key] = 'dummy';
        logger.warn('Valkey probe failed, falling back to dummy', { instance, error: e?.message });
      }
    };

    // Race with timeout to avoid hanging
    await Promise.race([probe(), new Promise((resolve) => setTimeout(resolve, 1000))]);

    ValkeyInstances[key] = client;
    if (!ValkeyStatus[key]) ValkeyStatus[key] = 'dummy';
  } catch (err) {
    ValkeyStatus[key] = 'dummy';
    logger.warn('Valkey client creation failed, using dummy', { instance, error: err?.message });
  }

  return ValkeyInstances[key];
};

/**
 * Factory function to create a Data Transfer Object (DTO) from a payload.
 * It filters the payload to include only the keys specified in the `select` object.
 * @param {object} payload - The source object.
 * @param {object} select - An object where keys are field names and values are 1 to include them.
 * @returns {object} A new object containing only the selected fields from the payload.
 * @memberof ValkeyService
 */
const selectDtoFactory = (payload, select) => {
  const result = {};
  for (const key of Object.keys(select)) {
    if (select[key] === 1 && key in payload) result[key] = payload[key];
  }
  return result;
};

/**
 * Factory function to create a new Valkey client instance.
 * @param {object} options - Connection options for the iovalkey client.
 * @returns {Promise<Valkey>} A promise that resolves to a new Valkey client.
 * @memberof ValkeyService
 */
const valkeyClientFactory = async (options) => {
  const valkey = new Valkey({
    port: options?.port ? options.port : undefined,
    host: options?.host ? options.host : undefined,
    // Keep retry strategy minimal; state handled in createValkeyConnection
    retryStrategy: (attempt) => {
      if (attempt === 1) return undefined; // stop aggressive retries early
      return 1000; // retry interval if library continues
    },
  }); // Connect to 127.0.0.1:6379
  // new Valkey(6380); // 127.0.0.1:6380
  // new Valkey(6379, '192.168.1.1'); // 192.168.1.1:6379
  // new Valkey('/tmp/redis.sock');
  // new Valkey({
  //   port: 6379, // Valkey port
  //   host: '127.0.0.1', // Valkey host
  //   username: 'default', // needs Valkey >= 6
  //   password: 'my-top-secret',
  //   db: 0, // Defaults to 0
  // });
  return valkey;
};

/**
 * Retrieves an object from Valkey by key for a specific instance.
 * If the Valkey client is not connected or an error occurs, it falls back to the dummy in-memory store.
 * It automatically parses JSON strings.
 * @param {object} [options={ host: '', path: '' }] - The instance identifier.
 * @param {string} [key=''] - The key of the object to retrieve.
 * @returns {Promise<object|string|null>} A promise that resolves to the retrieved object, string, or null if not found.
 * @memberof ValkeyService
 */
const getValkeyObject = async (options = { host: '', path: '' }, key = '') => {
  const k = _instanceKey(options);
  const status = ValkeyStatus[k];
  try {
    if (status === 'connected' && ValkeyInstances[k]) {
      const value = await ValkeyInstances[k].get(key);
      if (value == null) return null;
      try {
        return JSON.parse(value);
      } catch {
        // not JSON, return raw string
        return value;
      }
    }
  } catch (err) {
    logger.warn('Valkey get failed, using dummy', { key, err: err?.message });
  }
  // Dummy fallback returns stored value as-is (string or object)
  return DummyStores[k]?.get(key) ?? null;
};

/**
 * Sets an object or string in Valkey for a specific instance.
 * If the Valkey client is not connected, it writes to the in-memory dummy store instead.
 * Objects are automatically stringified.
 * @param {object} [options={ host: '', path: '' }] - The instance identifier.
 * @param {string} [key=''] - The key under which to store the payload.
 * @param {object|string} [payload={}] - The data to store.
 * @returns {Promise<string>} A promise that resolves to 'OK' on success.
 * @memberof ValkeyService
 */
const setValkeyObject = async (options = { host: '', path: '' }, key = '', payload = {}) => {
  const k = _instanceKey(options);
  const isString = typeof payload === 'string';
  const value = isString ? payload : JSON.stringify(payload);
  try {
    if (ValkeyStatus[k] === 'connected' && ValkeyInstances[k]) {
      return await ValkeyInstances[k].set(key, value);
    }
  } catch (err) {
    logger.warn('Valkey set failed, writing to dummy', { key, err: err?.message });
  }
  if (!DummyStores[k]) DummyStores[k] = new Map();
  // Store raw string or object accordingly
  DummyStores[k].set(key, isString ? payload : payload);
  return 'OK';
};

/**
 * Updates an existing object in Valkey by merging it with a new payload.
 * It retrieves the current object, merges it with the new payload, and sets the updated object back.
 * It also updates the `updatedAt` timestamp.
 * @param {object} [options={ host: '', path: '' }] - The instance identifier.
 * @param {string} [key=''] - The key of the object to update.
 * @param {object} [payload={}] - The new data to merge into the object.
 * @returns {Promise<string>} A promise that resolves to the result of the set operation.
 * @memberof ValkeyService
 */
const updateValkeyObject = async (options = { host: '', path: '' }, key = '', payload = {}) => {
  let base = await getValkeyObject(options, key);
  if (typeof base !== 'object' || base === null) base = {};
  base.updatedAt = new Date().toISOString();
  return await setValkeyObject(options, key, { ...base, ...payload });
};

/**
 * Factory function to create a new object based on a model schema.
 * It generates a new object with default properties like `_id`, `createdAt`, and `updatedAt`,
 * and model-specific properties.
 * @param {object} [options={ host: 'localhost', path: '', object: {} }] - Options for object creation.
 * @param {string} [options.host='localhost'] - The host context for the object.
 * @param {object} [options.object={}] - An initial object to extend.
 * @param {string} [model=''] - The name of the model schema to use (e.g., 'user').
 * @returns {Promise<object>} A promise that resolves to the newly created object.
 * @memberof ValkeyService
 */
const valkeyObjectFactory = async (options = { host: 'localhost', path: '', object: {} }, model = '') => {
  const idoDate = new Date().toISOString();
  options.object = options.object || {};
  const { object } = options;
  const _id = new mongoose.Types.ObjectId().toString();
  object._id = _id;
  object.createdAt = idoDate;
  object.updatedAt = idoDate;
  switch (model) {
    case 'user': {
      const role = 'guest';
      object._id = `${role}${_id}`;
      return {
        ...object,
        username: `${role}${_id.slice(-5)}`,
        email: `${_id}@${options.host}`,
        password: hashPassword(process.env.JWT_SECRET),
        role,
        failedLoginAttempts: 0,
        phoneNumbers: [],
        publicKey: [],
        profileImageId: null,
        emailConfirmed: false,
        recoverTimeOut: null,
        lastLoginDate: null,
        activeSessions: [],
      };
    }
    default:
      throw new Error(`model schema not found: ${model}`);
  }
};

/**
 * A collection of Valkey-related API functions.
 * @type {object}
 * @memberof ValkeyServiceService
 */
const ValkeyAPI = {
  valkeyClientFactory,
  selectDtoFactory,
  getValkeyObject,
  setValkeyObject,
  valkeyObjectFactory,
  updateValkeyObject,
  createValkeyConnection,
};

export {
  valkeyClientFactory,
  selectDtoFactory,
  getValkeyObject,
  setValkeyObject,
  valkeyObjectFactory,
  updateValkeyObject,
  isValkeyEnable,
  createValkeyConnection,
  ValkeyAPI,
};
