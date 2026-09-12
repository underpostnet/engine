/**
 * @module src/api/cyberia-server-registry
 *
 * The live game-server list.
 *
 * The engine already serves world content to the game servers and
 * presentation hints to the game client. It is the one process both others
 * talk to, so the list of reachable game servers belongs here.
 *
 * Endpoints:
 *   POST /api/cyberia-server-registry
 *     body   { serverUrl, instanceCode, name }
 *     header X-Cyberia-Server-Api-Key: CYBERIA_SERVER_API_KEY
 *     -> 200 { ttlSeconds, server } | 400 bad body | 401 bad key | 503 no key
 *     A game server reports itself at startup and every heartbeat. The write
 *     upserts on serverUrl, so a report is also the registration.
 *
 *   GET /api/cyberia-server-registry
 *     -> 200 { status, data: { url, serverUrl, instanceCode, name, lastSeen } }
 *     -> 404 when no server is live
 *     The most recent live server. The game client has no other source for
 *     its websocket URL, so this read carries no key.
 *
 * Liveness is the `lastSeen` stamp plus a Mongo TTL index, not a connection.
 * A server that stops reporting leaves the list on its own.
 *
 */

import express from 'express';
import { crossOriginMiddleware } from '../../server/network/middlewares.js';
import { CyberiaServerRegistryController } from './cyberia-server-registry.controller.js';

class CyberiaServerRegistryRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.use(crossOriginMiddleware);

    router.post('/', async (req, res) => await CyberiaServerRegistryController.report(req, res, options));
    router.get('/', async (req, res) => await CyberiaServerRegistryController.latest(req, res, options));

    return router;
  }
}

const ApiRouter = (options) => CyberiaServerRegistryRouter.router(options);

export { ApiRouter, CyberiaServerRegistryRouter };
