/**
 * gRPC transport for the Cyberia Engine data pipeline.
 *
 * Runs alongside Express on a separate port (default 50051).
 * Thin adapter over src/projects/cyberia/instance-data.js — the shared
 * world-load/boot assembly also served by the REST fallback at
 * /api/cyberia-instance/boot/* — so both transports stay equivalent.
 *
 * @module src/grpc/cyberia/grpc-server.js
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { loggerFactory } from '../../server/logger.js';
import {
  buildFallbackConfig,
  buildFallbackInstanceConfig,
  fetchFullInstance,
  fetchMapData,
  fetchObjectLayer,
  fetchObjectLayerManifest,
  getInstanceModels,
  objectLayerQueryFilter,
  pingData,
  toObjectLayerMsg,
} from '../../projects/cyberia/instance-data.js';

const logger = loggerFactory(import.meta);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, '../../../cyberia-server/gen/proto/cyberia.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).cyberia;

function buildHandlers(dbKey) {
  return {
    async ping(_call, callback) {
      callback(null, pingData());
    },

    // Server-streaming: streams all ObjectLayers
    async getObjectLayerBatch(call) {
      try {
        const models = getInstanceModels(dbKey);
        const cursor = models.ObjectLayer.find(objectLayerQueryFilter(call.request.itemTypeFilter)).lean().cursor();
        for await (const doc of cursor) {
          call.write(toObjectLayerMsg(doc));
        }
        call.end();
      } catch (err) {
        logger.error('getObjectLayerBatch:', err);
        call.destroy(new Error(err.message));
      }
    },

    async getObjectLayer(call, callback) {
      try {
        const msg = await fetchObjectLayer(getInstanceModels(dbKey), call.request.itemId);
        if (!msg)
          return callback({ code: grpc.status.NOT_FOUND, message: `ObjectLayer "${call.request.itemId}" not found` });
        callback(null, msg);
      } catch (err) {
        logger.error('getObjectLayer:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async getMapData(call, callback) {
      try {
        const result = await fetchMapData(getInstanceModels(dbKey), call.request);
        if (!result)
          return callback({ code: grpc.status.NOT_FOUND, message: `Map "${call.request.mapCode}" not found` });
        callback(null, result);
      } catch (err) {
        logger.error('getMapData:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async getFullInstance(call, callback) {
      try {
        callback(null, await fetchFullInstance(getInstanceModels(dbKey), call.request.instanceCode));
      } catch (err) {
        logger.error('getFullInstance:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async getObjectLayerManifest(_call, callback) {
      try {
        callback(null, await fetchObjectLayerManifest(getInstanceModels(dbKey)));
      } catch (err) {
        logger.error('getObjectLayerManifest:', err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Server lifecycle
// ═══════════════════════════════════════════════════════════════════

class GrpcServer {
  static _server = null;

  /**
   * @param {Object} opts
   * @param {string} opts.host  - DataBaseProviderService host key
   * @param {string} opts.path  - DataBaseProviderService path key
   * @param {number} [opts.port=50051]
   */
  static async start({ host, path: dbPath, port = 50051 } = {}) {
    const dbKey = `${host}${dbPath}`;
    const server = new grpc.Server({
      'grpc.max_send_message_length': 64 * 1024 * 1024,
      'grpc.max_receive_message_length': 16 * 1024 * 1024,
    });

    server.addService(proto.CyberiaDataService.service, buildHandlers(dbKey));

    // gRPC runs over Kubernetes internal network (ClusterIP) — always insecure
    const creds = grpc.ServerCredentials.createInsecure();

    return new Promise((resolve, reject) => {
      server.bindAsync(`0.0.0.0:${port}`, creds, (err) => {
        if (err) {
          logger.error('gRPC bind failed:', err);
          return reject(err);
        }
        GrpcServer._server = server;
        logger.info(`gRPC server listening on 0.0.0.0:${port}`);
        resolve(server);
      });
    });
  }

  static async stop() {
    if (!GrpcServer._server) return;
    return new Promise((resolve) => {
      GrpcServer._server.tryShutdown(() => {
        GrpcServer._server = null;
        logger.info('gRPC server stopped');
        resolve();
      });
    });
  }
}

export { GrpcServer, buildFallbackConfig, buildFallbackInstanceConfig };
