/**
 * @module src/api/cyberia-economy
 *
 * Economy profiles.
 *
 * Endpoints:
 *   GET    /api/v1/cyberia-economy[/:code]   the profiles
 *   GET    /api/v1/cyberia-economy/schema/contract  the fields, bounds and defaults of a profile and a row
 *   GET    /api/v1/cyberia-economy/:code/view   the profile, the worlds that name it and their wallets
 *   POST   /api/v1/cyberia-economy/:code/clone  moderator; body {code, name}: a copy with its item rows
 *   POST   /api/v1/cyberia-economy           moderator
 *   PUT    /api/v1/cyberia-economy/:code     moderator; body names the revision it read
 *   DELETE /api/v1/cyberia-economy/:code     moderator; only a profile no world names
 */

import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaEconomyController } from './cyberia-economy.controller.js';

class CyberiaEconomyRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.get('/schema/contract', async (req, res) => await CyberiaEconomyController.contract(req, res, options));
    router.get('/:id/view', async (req, res) => await CyberiaEconomyController.view(req, res, options));
    router.post(
      '/:id/clone',
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaEconomyController.clone(req, res, options),
    );
    return registerCrudRoutes(router, CyberiaEconomyController, options);
  }
}

const ApiRouter = (options) => CyberiaEconomyRouter.router(options);

export { ApiRouter, CyberiaEconomyRouter };
