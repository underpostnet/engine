import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaEntityTypeDefaultController } from './cyberia-entity-type-default.controller.js';

class CyberiaEntityTypeDefaultRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // Custom actions first: the generic /:id routes below capture everything.
    router.post(
      `/sync-instance/:instanceCode`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaEntityTypeDefaultController.sync(req, res, options),
    );
    router.post(
      `/:id/instances`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaEntityTypeDefaultController.setInstances(req, res, options),
    );
    return registerCrudRoutes(router, CyberiaEntityTypeDefaultController, options);
  }
}

const ApiRouter = (options) => CyberiaEntityTypeDefaultRouter.router(options);

export { ApiRouter, CyberiaEntityTypeDefaultRouter };
