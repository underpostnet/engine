/**
 * gRPC transport of the Cyberia Engine.
 *
 * Runs beside Express on its own port (default 50051) and serves two services:
 *   CyberiaDataService   — thin adapter over src/projects/cyberia/instance-data.js, the same
 *                          assembly the REST fallback at /api/v1/cyberia-instance/boot/* serves.
 *   CyberiaPlayerService — thin adapter over src/projects/cyberia/player. Every call must carry the
 *                          server key; the service runs only on a host that loads the player APIs.
 *
 * @module src/grpc/cyberia/grpc-server.js
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { activateContentRelease, watchContentRelease } from '../../projects/cyberia/content/content-release.js';
import {
  buildFallbackConfig,
  fetchFullInstance,
  fetchMapData,
  fetchItemContent,
  fetchObjectLayer,
  fetchObjectLayerManifest,
  fetchObjectLayerBatch,
  getInstanceModels,
  pingData,
} from '../../projects/cyberia/instance-data.js';
import { SERVER_API_KEY_HEADER, isServerApiKey } from '../../projects/cyberia/runtime/server-key.js';
import { commitState } from '../../projects/cyberia/player/player-state.js';
import {
  acquireSession,
  checkpointSessions,
  consumeLaunch,
  issueResume,
  issueTravel,
  releaseSession,
} from '../../projects/cyberia/player/player-session.js';
import { listFriends, updateFriendship, updateStatusNote } from '../../projects/cyberia/player/social.js';
import { counter, histogram } from '../../server/ops/metrics.js';

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

    async getItemContent(call, callback) {
      try {
        callback(null, await fetchItemContent(getInstanceModels(dbKey), call.request.itemId));
      } catch (err) {
        logger.error('getItemContent:', err);
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

const playerCalls = counter({
  name: 'cyberia_player_rpc_total',
  help: 'Player service calls by method and outcome: ok, duplicate, a refusal reason, or error',
  labelNames: ['method', 'outcome'],
});
const playerSeconds = histogram({
  name: 'cyberia_player_rpc_seconds',
  help: 'Time a player service call takes',
  labelNames: ['method'],
});

// The models the player service writes. A host without them serves content only.
const PLAYER_MODELS = [
  'CyberiaUniverse',
  'CyberiaPlayer',
  'CyberiaGameSession',
  'CyberiaGameTicket',
  'CyberiaSocial',
  'CyberiaSocialProfile',
  'CyberiaQuestProgress',
  'User',
];

const servesPlayers = (dbKey) => {
  const models = DataBaseProviderService.servedModels(dbKey);
  return PLAYER_MODELS.every((name) => models[name]);
};

/**
 * One unary player method: checks the server key, times the call, counts its outcome and maps
 * an exception to INTERNAL, which the game server retries.
 */
const playerMethod = (method, run) => async (call, callback) => {
  const [key] = call.metadata.get(SERVER_API_KEY_HEADER);
  if (!isServerApiKey(key)) {
    playerCalls.inc({ method, outcome: 'unauthenticated' });
    return callback({ code: grpc.status.UNAUTHENTICATED, message: 'server key required' });
  }
  const done = playerSeconds.startTimer({ method });
  try {
    const response = await run(call.request);
    const outcome = response?.refusal || (response?.duplicate ? 'duplicate' : 'ok');
    playerCalls.inc({ method, outcome });
    if (response?.refusal)
      logger.info(`${method} refused: ${response.refusal}${response.defect ? ` (${response.defect})` : ''}`);
    callback(null, response ?? {});
  } catch (err) {
    playerCalls.inc({ method, outcome: 'error' });
    logger.error(`${method}:`, err);
    callback({ code: grpc.status.INTERNAL, message: err.message });
  } finally {
    done();
  }
};

/**
 * The player service of one host: the host that holds the player APIs and its Valkey instance.
 * @param {{host: string, path: string}} context
 */
function buildPlayerHandlers(context) {
  return {
    consumeGameLaunchTicket: playerMethod('ConsumeGameLaunchTicket', (req) => consumeLaunch(req, context)),
    issueResumeTicket: playerMethod('IssueResumeTicket', (req) => issueResume(req, context)),
    issueTravelTicket: playerMethod('IssueTravelTicket', (req) => issueTravel(req, context)),
    acquirePlayerSession: playerMethod('AcquirePlayerSession', (req) => acquireSession(req, context)),
    commitPlayerState: playerMethod('CommitPlayerState', (req) => commitState(req, context)),
    checkpointPlayerSessions: playerMethod('CheckpointPlayerSessions', (req) => checkpointSessions(req, context)),
    releasePlayerSession: playerMethod('ReleasePlayerSession', async (req) => {
      await releaseSession(req, context);
      return {};
    }),
    listFriends: playerMethod('ListFriends', (req) => listFriends(req, context)),
    updateFriendship: playerMethod('UpdateFriendship', (req) => updateFriendship(req, context)),
    updateStatusNote: playerMethod('UpdateStatusNote', (req) => updateStatusNote(req, context)),
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
      if (release.artifact.error) logger.warn(release.artifact.error);
      GrpcServer._releaseWatch = watchContentRelease({ host, path: dbPath });
    }
    const server = new grpc.Server({
      'grpc.max_send_message_length': 64 * 1024 * 1024,
      'grpc.max_receive_message_length': 16 * 1024 * 1024,
    });

    server.addService(proto.CyberiaDataService.service, buildHandlers(dbKey));
    if (servesPlayers(dbKey))
      server.addService(proto.CyberiaPlayerService.service, buildPlayerHandlers({ host, path: dbPath }));
    else logger.info(`Player service off: ${dbKey} does not load ${PLAYER_MODELS.join(', ')}`);

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

export { GrpcServer, buildFallbackConfig, buildPlayerHandlers, proto as cyberiaProto };
