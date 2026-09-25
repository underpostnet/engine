/**
 * gRPC transport for the Cyberia Engine data pipeline.
 *
 * Runs beside Express on its own port (default 50051). Thin adapter over
 * src/projects/cyberia/instance-data.js, the same assembly the REST fallback
 * at /api/v1/cyberia-instance/boot/* serves, so both transports stay equivalent.
 *
 * @module src/grpc/cyberia/grpc-server.js
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { loggerFactory } from '../../server/ops/logger.js';
import { activateContentRelease, watchContentRelease } from '../../projects/cyberia/content-release.js';
import { runInContentView } from '../../db/content-view.js';
import {
  buildFallbackConfig,
  fetchFullInstance,
  fetchMapData,
  fetchObjectLayer,
  fetchObjectLayerManifest,
  fetchObjectLayerBatch,
  getInstanceModels,
  pingData,
} from '../../projects/cyberia/instance-data.js';

const logger = loggerFactory(import.meta);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The engine serves CyberiaDataService, so it owns the schema. cyberia-server gets a generated copy.
const PROTO_PATH = path.join(__dirname, 'cyberia.proto');

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

    // Server-streaming: streams the current definition of every item id
    async getObjectLayerBatch(call) {
      try {
        for (const msg of await fetchObjectLayerBatch(getInstanceModels(dbKey), call.request.itemTypeFilter)) {
          call.write(msg);
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
  static _releaseWatch = null;

  /**
   * @param {Object} opts
   * @param {string} opts.host  - DataBaseProviderService host key
   * @param {string} opts.path  - DataBaseProviderService path key
   * @param {number} [opts.port=50051]
   */
  static async start({ host, path: dbPath, port = 50051 } = {}) {
    const dbKey = `${host}${dbPath}`;
    // The world this process serves is the promoted content release; later promotions are
    // followed while it runs.
    const release = await activateContentRelease({ host, path: dbPath });
    if (release) {
      logger.info(`Content release ${release.releaseId || '(none promoted)'} served from ${release.database}`);
      GrpcServer._releaseWatch = watchContentRelease({ host, path: dbPath });
    }
    const server = new grpc.Server({
      'grpc.max_send_message_length': 64 * 1024 * 1024,
      'grpc.max_receive_message_length': 16 * 1024 * 1024,
    });

    // The game servers read the content players are served: the active release, never the
    // workspace being authored.
    const handlers = Object.fromEntries(
      Object.entries(buildHandlers(dbKey)).map(([name, handler]) => [
        name,
        (...args) => runInContentView('served', () => handler(...args)),
      ]),
    );
    server.addService(proto.CyberiaDataService.service, handlers);

    // gRPC stays on the cluster-internal network, so credentials are insecure.
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
    GrpcServer._releaseWatch?.stop();
    GrpcServer._releaseWatch = null;
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

export { GrpcServer, buildFallbackConfig };
