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
 *        | 409 account launch of a world outside every universe | 429 too many open tickets
 *        | 503 no server of the world takes sessions
 *
 * The bearer header is not ambient, so a cross-site page cannot ask for a ticket. The game server
 * consumes the ticket over gRPC (`CyberiaPlayerService.ConsumeGameLaunchTicket`).
 */

import express from 'express';
import { CyberiaGameTicketController } from './cyberia-game-ticket.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-game-ticket',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.post('/', auth.authenticate, async (req, res) => CyberiaGameTicketController.post(req, res, context));
    return router;
  },
};
