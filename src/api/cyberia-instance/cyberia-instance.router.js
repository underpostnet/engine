import { loggerFactory } from '../../server/logger.js';
import { CyberiaInstanceController } from './cyberia-instance.controller.js';
import { userGuard, moderatorGuard, adminGuard } from '../../server/auth.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CyberiaInstanceRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // ── Custom actions (must come before generic /:id routes) ──────────────
    router.get(`/fallback-world`, async (req, res) => await CyberiaInstanceController.fallbackWorld(req, res, options));
    router.get(
      `/:id/portal-connect`,
      options.authMiddleware,
      userGuard,
      async (req, res) => await CyberiaInstanceController.portalConnect(req, res, options),
    );

    router.post(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaInstanceController.post(req, res, options),
    );
    router.post(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaInstanceController.post(req, res, options),
    );
    router.get(`/:id`, async (req, res) => await CyberiaInstanceController.get(req, res, options));
    router.get(`/`, async (req, res) => await CyberiaInstanceController.get(req, res, options));
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaInstanceController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaInstanceController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaInstanceController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await CyberiaInstanceController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => CyberiaInstanceRouter.router(options);

export { ApiRouter, CyberiaInstanceRouter };
