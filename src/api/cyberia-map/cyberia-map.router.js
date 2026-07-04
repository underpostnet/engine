import { loggerFactory } from '../../server/logger.js';
import { CyberiaMapController } from './cyberia-map.controller.js';
import { moderatorGuard, adminGuard } from '../../server/auth.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CyberiaMapRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMapController.post(req, res, options),
    );
    router.post(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMapController.post(req, res, options),
    );
    router.get(`/search-codes`, async (req, res) => await CyberiaMapController.get(req, res, options));
    router.get(`/:id`, async (req, res) => await CyberiaMapController.get(req, res, options));
    router.get(`/`, async (req, res) => await CyberiaMapController.get(req, res, options));
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMapController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMapController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMapController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await CyberiaMapController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => CyberiaMapRouter.router(options);

export { ApiRouter, CyberiaMapRouter };
