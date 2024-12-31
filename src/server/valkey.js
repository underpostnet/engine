import Valkey from 'iovalkey';
import mongoose from 'mongoose';
import { hashPassword } from './auth.js';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

let valkeyEnabled = true;

const disableValkeyErrorMessage = 'valkey is not enabled';

const isValkeyEnable = () => valkeyEnabled;

const selectDtoFactory = (payload, select) => {
  const result = {};
  for (const key of Object.keys(select)) {
    if (select[key] === 1 && key in payload) result[key] = payload[key];
  }
  return result;
};

const valkeyClientFactory = async () => {
  const valkey = new Valkey({
    retryStrategy: (attempt) => {
      if (attempt === 1) {
        valkey.disconnect();
        valkeyEnabled = false;
        logger.warn('Valkey service not enabled', { valkeyEnabled });
        return;
      }
      return 1000; // 1 second interval attempt
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

const getValkeyObject = async (key = '') => {
  if (!valkeyEnabled) {
    logger.warn(disableValkeyErrorMessage + ' get: ', key);
    return null;
  }
  const object = await valkey.get(key);
  try {
    return JSON.parse(object);
  } catch (error) {
    return object;
  }
};

const setValkeyObject = async (key = '', payload = {}) => {
  if (!valkeyEnabled) throw new Error(disableValkeyErrorMessage);
  return await valkey.set(key, JSON.stringify(payload));
};

const updateValkeyObject = async (key = '', payload = {}) => {
  if (!valkeyEnabled) throw new Error(disableValkeyErrorMessage);
  const object = await getValkeyObject(key, valkey);
  object.updatedAt = new Date().toISOString();
  return await valkey.set(key, JSON.stringify({ ...object, ...payload }));
};

const valkeyObjectFactory = async (module = '', options = { host: 'localhost', object: {} }) => {
  if (!valkeyEnabled) throw new Error(disableValkeyErrorMessage);
  const idoDate = new Date().toISOString();
  options.object = options.object || {};
  const { object } = options;
  const _id = new mongoose.Types.ObjectId().toString();
  object._id = _id;
  object.createdAt = idoDate;
  object.updatedAt = idoDate;
  switch (module) {
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
      throw new Error(`module schema not found: ${module}`);
  }
};

const ValkeyAPI = {
  valkeyClientFactory,
  selectDtoFactory,
  getValkeyObject,
  setValkeyObject,
  valkeyObjectFactory,
  updateValkeyObject,
};

const valkey = await ValkeyAPI.valkeyClientFactory();

export {
  valkeyClientFactory,
  selectDtoFactory,
  getValkeyObject,
  setValkeyObject,
  valkeyObjectFactory,
  updateValkeyObject,
  isValkeyEnable,
  ValkeyAPI,
};
