/**
 * @module src/api/cyberia-universe
 *
 * Universes: the instances that share player profiles, the layout of their graph and their links.
 *
 * Endpoints:
 *   GET    /api/v1/cyberia-universe[/:code]           the documents
 *   GET    /api/v1/cyberia-universe/:code/view         members with content and availability
 *   GET    /api/v1/cyberia-universe/instance/:code     the view of the universe of one instance
 *   POST   /api/v1/cyberia-universe                    moderator
 *   PUT    /api/v1/cyberia-universe/:id                creator or admin; body names the revision it read
 *   DELETE /api/v1/cyberia-universe/:id                creator or admin
 */

import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaUniverseController } from './cyberia-universe.controller.js';

class CyberiaUniverseRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.get(
      '/instance/:instanceCode',
      async (req, res) => await CyberiaUniverseController.ofInstance(req, res, options),
    );
    router.get('/:id/view', async (req, res) => await CyberiaUniverseController.view(req, res, options));
    return registerCrudRoutes(router, CyberiaUniverseController, options);
  }
}

const ApiRouter = (options) => CyberiaUniverseRouter.router(options);

export { ApiRouter, CyberiaUniverseRouter };
