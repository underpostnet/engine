/**
 * @module src/api/cyberia-game-ticket
 *
 * Game launch tickets.
 *
 * Endpoint:
 *   POST /api/v1/cyberia-game-ticket
 *     header Authorization: Bearer <access token of an account session or a guest>
 *     body   { instanceCode }
 *     -> 200 { ticket, expiresAt } | 400 no world | 401 guest expired | 403 no session | 404 unknown world
 *        | 429 too many open tickets
 *
 * The bearer header is not ambient, so a cross-site page cannot ask for a ticket. The game server
 * consumes the ticket over gRPC (`CyberiaPlayerService.ConsumeGameLaunchTicket`).
 */

import express from 'express';
import { CyberiaGameTicketController } from './cyberia-game-ticket.controller.js';

class CyberiaGameTicketRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post('/', options.authMiddleware, async (req, res) => CyberiaGameTicketController.post(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaGameTicketRouter.router(options);

export { ApiRouter, CyberiaGameTicketRouter };
