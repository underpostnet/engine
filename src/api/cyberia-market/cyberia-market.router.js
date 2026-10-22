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
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaMarketController } from './cyberia-market.controller.js';

class CyberiaMarketRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.get('/schema/contract', async (req, res) => await CyberiaMarketController.contract(req, res, options));
    router.get('/:id/view', async (req, res) => await CyberiaMarketController.view(req, res, options));
    router.post(
      '/:id/clone',
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMarketController.clone(req, res, options),
    );
    router.post(
      '/:id/reload',
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMarketController.reload(req, res, options),
    );
    return registerCrudRoutes(router, CyberiaMarketController, options);
  }
}

const ApiRouter = (options) => CyberiaMarketRouter.router(options);

export { ApiRouter, CyberiaMarketRouter };
