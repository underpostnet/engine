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

const valkeyObjectFactory = async (module = '', options) => {
  let _id = new mongoose.Types.ObjectId();
  switch (module) {
    case 'user': {
      _id = `guest${_id}`;
      return {
        _id,
        username: _id,
        email: `${_id}@${options.host}`,
        password: hashPassword(process.env.JWT_SECRET),
        role: 'guest',
      };
    }
  }
};

export { valkeyClientFactory, selectDtoFactory, getValkeyObject, setValkeyObject, valkeyObjectFactory };
