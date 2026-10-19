/**
 * @module src/api/cyberia-server-registry
 *
 * The live game servers and the worlds they serve.
 *
 * Endpoints:
 *   POST /api/v1/cyberia-server-registry
 *     body   { serverId, url, instanceCode, name, state, seq }
 *     header X-Cyberia-Server-Api-Key: CYBERIA_SERVER_API_KEY
 *     -> 200 { reportSeconds, ttlSeconds, stale, server } | 400 bad report | 401 bad key | 503 no key
 *     A game server process reports itself at startup and every reportSeconds. The write upserts
 *     on serverId above the stored seq, so a report is also the registration.
 *
 *   GET /api/v1/cyberia-server-registry
 *     -> 200 [{ instanceCode, url, name, status, ready, draining }]
 *     One logical endpoint per world and public URL; replicas of one deployment share it.
 *
 *   GET /api/v1/cyberia-server-registry/servers   (moderator)
 *     -> 200 [{ serverId, url, instanceCode, name, state, seq, startedAt, lastSeen }]
 *
 * Liveness is the `lastSeen` stamp plus a Mongo TTL index, not a connection.
 */

import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { serverKeyGuard } from '../../projects/cyberia/runtime/server-key.js';
import { CyberiaServerRegistryController } from './cyberia-server-registry.controller.js';

class CyberiaServerRegistryRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaServerRegistryController[method](req, res, options);
    router.post('/', serverKeyGuard, handle('report'));
    router.get('/servers', options.authMiddleware, moderatorGuard, handle('servers'));
    router.get('/', handle('endpoints'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaServerRegistryRouter.router(options);

export { ApiRouter, CyberiaServerRegistryRouter };
