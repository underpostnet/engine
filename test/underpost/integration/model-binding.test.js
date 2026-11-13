import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongooseDB } from '../../../src/db/mongo/mongoose-db.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// Needs `mongod`: `UNDERPOST_MONGOD_BIN`, or one on PATH.
describe.skipIf(!mongodBinary)('model binding', () => {
  let mongod;
  const connect = (name) => MongooseDB.connect({ host: mongod.host, name });

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    mongod = await startMongod('binding');
  }, 60000);

  afterAll(async () => {
    await mongod?.stop();
  });

  it('initializes the models one at a time, and completes before it returns', async () => {
    const conn = await mongoose
      .createConnection(`mongodb://${mongod.host}/binding`, { monitorCommands: true })
      .asPromise();
    const client = conn.getClient();
    const created = [];
    let running = 0;
    let peak = 0;
    client.on('commandStarted', ({ commandName, command }) => {
      if (commandName !== 'create') return;
      created.push(command.create);
      peak = Math.max(peak, ++running);
    });
    const ended = ({ commandName }) => commandName === 'create' && running--;
    client.on('commandSucceeded', ended);
    client.on('commandFailed', ended);

    const apis = ['file', 'ipfs', 'test', 'user', 'document', 'instance'];
    const models = await MongooseDB.loadModels({ conn, apis });

    expect(Object.keys(models)).toHaveLength(apis.length);
    expect(created).toHaveLength(apis.length);
    // A query after the load waits for no model command.
    expect(peak).toBe(1);
    expect(running).toBe(0);
    await conn.close();
  });

  it('binds a model whose index build fails, and keeps the index that conflicts', async () => {
    const conn = await connect('binding-conflict');
    const collection = await MongooseDB.collectionName('ipfs');
    await conn.db.collection(collection).createIndex({ cid: 1 }, { name: 'cid_1' });

    const Ipfs = await MongooseDB.bindModel(conn, 'ipfs');

    expect(Ipfs.modelName).toBe('Ipfs');
    const index = (await conn.db.collection(collection).indexes()).find(({ name }) => name === 'cid_1');
    expect(index.unique).toBeUndefined();
    await conn.close();
  });
});
