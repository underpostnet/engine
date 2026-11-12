/**
 * @module src/api/cyberia-market
 *
 * Market profiles.
 *
 * Endpoints:
 *   GET    /api/v1/cyberia-market[/:code]        the profiles
 *   GET    /api/v1/cyberia-market/schema/contract the fields, bounds and defaults of a profile and a terminal
 *   GET    /api/v1/cyberia-market/:code/view     the profile, its terminals and the markets they open
 *   POST   /api/v1/cyberia-market/:code/clone    moderator; body {code, name}: a copy with no listing
 *   POST   /api/v1/cyberia-market/:code/reload   moderator; the running worlds that open it reload
 *   POST   /api/v1/cyberia-market                moderator
 *   PUT    /api/v1/cyberia-market/:code          moderator; body names the revision it read
 *   DELETE /api/v1/cyberia-market/:code          moderator; only a profile nothing names or holds goods under
 */

import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaMarketController } from './cyberia-market.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-market',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.get('/schema/contract', async (req, res) => await CyberiaMarketController.contract(req, res, context));
    router.get('/:id/view', async (req, res) => await CyberiaMarketController.view(req, res, context));
    router.post(
      '/:id/clone',
      auth.requireModerator,
      async (req, res) => await CyberiaMarketController.clone(req, res, context),
    );
    router.post(
      '/:id/reload',
      auth.requireModerator,
      async (req, res) => await CyberiaMarketController.reload(req, res, context),
    );
    return registerCrudRoutes(router, CyberiaMarketController, context);
  },
};
