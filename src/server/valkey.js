import Valkey from 'iovalkey';
import mongoose from 'mongoose';
import { hashPassword } from './auth.js';

const selectDtoFactory = (payload, select) => {
  const result = {};
  for (const key of Object.keys(select)) {
    if (select[key] === 1 && key in payload) result[key] = payload[key];
  }
  return result;
};

const valkeyClientFactory = async () => {
  const valkey = new Valkey(); // Connect to 127.0.0.1:6379
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

const getValkeyObject = async (key = '', valkey = valkeyClientFactory()) => {
  return (await valkey.get(key)) ?? JSON.parse(await valkey.get(key));
};

const setValkeyObject = async (key = '', payload = {}, valkey = valkeyClientFactory()) => {
  return await valkey.set(key, JSON.stringify(payload));
};

const updateValkeyObject = async (key = '', payload = {}, valkey = valkeyClientFactory()) => {
  const object = await getValkeyObject(key, valkey);
  object.updatedAt = new Date().toISOString();
  return await valkey.set(key, JSON.stringify({ ...object, ...payload }));
};

const valkeyObjectFactory = async (module = '', options = { host: '', object: {} }) => {
  const object = options.object || { _id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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
      return object;
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

export {
  valkeyClientFactory,
  selectDtoFactory,
  getValkeyObject,
  setValkeyObject,
  valkeyObjectFactory,
  updateValkeyObject,
  ValkeyAPI,
};
