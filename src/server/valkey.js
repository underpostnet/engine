import Valkey from 'iovalkey';
import mongoose from 'mongoose';
import { hashPassword } from './auth.js';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

// Per-instance registries keyed by `${host}${path}`
const ValkeyInstances = {};
const DummyStores = {}; // in-memory Maps per instance
const ValkeyStatus = {}; // 'connected' | 'dummy' | 'error' | undefined

// Backward-compatible overall flag: true if any instance is connected
const isValkeyEnable = () => Object.values(ValkeyStatus).some((s) => s === 'connected');

const _instanceKey = (opts = { host: '', path: '' }) => `${opts.host || ''}${opts.path || ''}`;

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

const selectDtoFactory = (payload, select) => {
  const result = {};
  for (const key of Object.keys(select)) {
    if (select[key] === 1 && key in payload) result[key] = payload[key];
  }
  return result;
};

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

const updateValkeyObject = async (options = { host: '', path: '' }, key = '', payload = {}) => {
  let base = await getValkeyObject(options, key);
  if (typeof base !== 'object' || base === null) base = {};
  base.updatedAt = new Date().toISOString();
  return await setValkeyObject(options, key, { ...base, ...payload });
};

const valkeyObjectFactory = async (options = { host: 'localhost', object: {} }, model = '') => {
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
      };
    }
    default:
      throw new Error(`model schema not found: ${model}`);
  }
};

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
