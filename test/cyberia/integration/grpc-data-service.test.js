/**
 * The gRPC server of the Cyberia Engine, started on a free port against a real MongoDB: the data
 * service answers each content read, reports an absent item or map as NOT_FOUND and a broken read
 * as INTERNAL; the player service runs only on a host that loads the player APIs.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import * as grpc from '@grpc/grpc-js';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { GrpcServer, cyberiaProto } from '../../../src/grpc/cyberia/grpc-server.js';
import { CYBERIA_PLAYER_APIS } from '../../../src/projects/cyberia/stack/domain-ownership.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

vi.mock('../../../src/db/valkey/Valkey.js', async () =>
  (await import('../../support/valkey-memory.js')).memoryValkeyModule(),
);

const CONTENT = { host: 'grpc.content.test', path: '/' };
const BARE = { host: 'grpc.bare.test', path: '/' };
const CONTENT_APIS = ['object-layer', 'cyberia-item-catalog', 'cyberia-map', 'cyberia-instance'];

const freePort = () =>
  new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const unary = (client, method, request = {}, metadata = new grpc.Metadata()) =>
  new Promise((resolve, reject) =>
    client[method](request, metadata, (error, response) => (error ? reject(error) : resolve(response))),
  );

const streamed = (client, method, request = {}, deadlineMs = 10000) =>
  new Promise((resolve, reject) => {
    const messages = [];
    const call = client[method](request, { deadline: Date.now() + deadlineMs });
    call.on('data', (message) => messages.push(message));
    call.on('error', reject);
    call.on('end', () => resolve(messages));
  });

/** Starts the server for one host and returns clients of both services. */
const serve = async (context) => {
  const port = await freePort();
  await GrpcServer.start({ ...context, port });
  const address = `127.0.0.1:${port}`;
  return {
    data: new cyberiaProto.CyberiaDataService(address, grpc.credentials.createInsecure()),
    player: new cyberiaProto.CyberiaPlayerService(address, grpc.credentials.createInsecure()),
  };
};

describe.skipIf(!mongodBinary)('gRPC server', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    process.env.CYBERIA_SERVER_API_KEY = 'grpc-test-server-key';
    mongod = await startMongod('cyberia-grpc', { replSet: 'testset' });
    await DataBaseProviderService.load({
      apis: [...CONTENT_APIS, ...CYBERIA_PLAYER_APIS],
      ...CONTENT,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'testset', name: 'cyberia-grpc-content' },
    });
    await DataBaseProviderService.load({
      apis: ['cyberia-instance'],
      ...BARE,
      db: { provider: 'mongoose', host: mongod.host, replicaSet: 'testset', name: 'cyberia-grpc-bare' },
    });
  });

  afterAll(async () => {
    await GrpcServer.stop();
    await mongoose.disconnect();
    await mongod?.stop();
    delete process.env.CYBERIA_SERVER_API_KEY;
  });

  describe('on a content host with the player APIs', () => {
    let clients;

    beforeAll(async () => {
      clients = await serve(CONTENT);
    });

    afterAll(async () => {
      clients?.data.close();
      clients?.player.close();
      await GrpcServer.stop();
    });

    it('answers a ping with the server time', async () => {
      const before = Date.now();
      expect((await unary(clients.data, 'ping')).serverTimeMs).toBeGreaterThanOrEqual(before);
    });

    it('streams an empty batch, an empty manifest and the content an unbound item lacks', async () => {
      expect(await streamed(clients.data, 'getObjectLayerBatch', { itemTypeFilter: 'weapon' })).toEqual([]);
      expect(await unary(clients.data, 'getObjectLayerManifest')).toMatchObject({ entries: [] });
      const content = await unary(clients.data, 'getItemContent', { itemId: 'sword' });
      expect(content.objectLayers).toEqual([]);
      expect(content.unavailable).toEqual([{ itemId: 'sword', reason: 'unbound' }]);
    });

    it('answers NOT_FOUND for an unbound item and an unknown map, and INTERNAL for an unknown world', async () => {
      await expect(unary(clients.data, 'getObjectLayer', { itemId: 'sword' })).rejects.toMatchObject({
        code: grpc.status.NOT_FOUND,
        details: 'ObjectLayer "sword" not found',
      });
      await expect(unary(clients.data, 'getMapData', { mapCode: 'nowhere' })).rejects.toMatchObject({
        code: grpc.status.NOT_FOUND,
        details: 'Map "nowhere" not found',
      });
      await expect(unary(clients.data, 'getFullInstance', { instanceCode: 'absent' })).rejects.toMatchObject({
        code: grpc.status.INTERNAL,
      });
    });

    it('serves the player service and refuses a call without the server key', async () => {
      await expect(unary(clients.player, 'listFriends', { userId: 'u' })).rejects.toMatchObject({
        code: grpc.status.UNAUTHENTICATED,
      });
    });
  });

  describe('on a host without the content and player models', () => {
    let clients;

    beforeAll(async () => {
      clients = await serve(BARE);
    });

    afterAll(async () => {
      clients?.data.close();
      clients?.player.close();
      await GrpcServer.stop();
    });

    it('answers every content read it cannot run as an error', async () => {
      // The server ends a broken stream without a status, so the client's deadline closes it.
      await expect(streamed(clients.data, 'getObjectLayerBatch', {}, 1500)).rejects.toBeTruthy();
      for (const [method, request] of [
        ['getObjectLayer', { itemId: 'sword' }],
        ['getItemContent', { itemId: 'sword' }],
        ['getMapData', { mapCode: 'nowhere' }],
        ['getObjectLayerManifest', {}],
      ])
        await expect(unary(clients.data, method, request), method).rejects.toMatchObject({
          code: grpc.status.INTERNAL,
        });
    });

    it('leaves the player service off', async () => {
      await expect(unary(clients.player, 'listFriends', { userId: 'u' })).rejects.toMatchObject({
        code: grpc.status.UNIMPLEMENTED,
      });
    });
  });

  it('stops twice without a server', async () => {
    await GrpcServer.stop();
    await expect(GrpcServer.stop()).resolves.toBeUndefined();
  });
});
