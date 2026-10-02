import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// Needs `mongod`: `UNDERPOST_MONGOD_BIN`, or one on PATH.
const context = { host: 'reconnect.test', path: '/' };

describe.skipIf(!mongodBinary)('a database reconnect', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    mongod = await startMongod('reconnect');
    await DataBaseProviderService.load({
      apis: ['file'],
      ...context,
      db: { provider: 'mongoose', host: mongod.host, name: 'reconnect' },
    });
  }, 60000);

  afterAll(async () => {
    await DataBaseProviderService.getProvider(context).close();
    delete DataBaseProviderService.instance[`${context.host}${context.path}`];
    await mongod?.stop();
  });

  it('replaces the connection and the models of the provider in place, and closes the replaced connection', async () => {
    const provider = DataBaseProviderService.getProvider(context);
    const { connection: replaced, models: captured } = provider;
    await provider.models.File.create({ name: 'a.txt', data: Buffer.from('a') });

    expect(await DataBaseProviderService.reconnect(context)).toBe(true);
    expect(DataBaseProviderService.getProvider(context)).toBe(provider);
    expect(provider.connection).not.toBe(replaced);
    expect(replaced.readyState).toBe(0);
    expect(await provider.models.File.countDocuments()).toBe(1);
    await expect(captured.File.countDocuments()).rejects.toThrow('Client must be connected');
  });
});
