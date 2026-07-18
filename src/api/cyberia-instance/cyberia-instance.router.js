import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { userGuard } from '../../server/auth.js';
import { CyberiaInstanceController } from './cyberia-instance.controller.js';

class CyberiaInstanceRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // ── Custom actions (must come before generic /:id routes) ──────────────
    router.get(`/fallback-world`, async (req, res) => await CyberiaInstanceController.fallbackWorld(req, res, options));
    // Instance Map — static topology/presence plus dynamic player capability activity.
    router.get(
      `/instance-map/:instanceCode/static`,
      async (req, res) => await CyberiaInstanceController.instanceMapStatic(req, res, options),
    );
    router.get(
      `/instance-map/:instanceCode/dynamic`,
      async (req, res) => await CyberiaInstanceController.instanceMapDynamic(req, res, options),
    );
    router.get(
      `/:id/portal-connect`,
      options.authMiddleware,
      userGuard,
      async (req, res) => await CyberiaInstanceController.portalConnect(req, res, options),
    );
    return registerCrudRoutes(router, CyberiaInstanceController, options);
  }
}

const ApiRouter = (options) => CyberiaInstanceRouter.router(options);

export { ApiRouter, CyberiaInstanceRouter };
