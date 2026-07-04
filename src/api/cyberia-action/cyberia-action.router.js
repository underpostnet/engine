import { loggerFactory } from '../../server/logger.js';
import { CyberiaActionController } from './cyberia-action.controller.js';
import express from 'express';
import { moderatorGuard, adminGuard } from '../../server/auth.js';

const logger = loggerFactory(import.meta);

class CyberiaActionRouter {
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
      async (req, res) => await CyberiaActionController.post(req, res, options),
    );
    router.post(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaActionController.post(req, res, options),
    );
    // Direct lookup by code — the client fetches an NPC's action metadata
    // (label, dialogue map) by the action code the Go server sends over AOI.
    router.get(`/code/:code`, async (req, res) => await CyberiaActionController.getByCode(req, res, options));
    router.get(
      `/:id`,
      // options.authMiddleware,
      async (req, res) => await CyberiaActionController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await CyberiaActionController.get(req, res, options));
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaActionController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaActionController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaActionController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await CyberiaActionController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => CyberiaActionRouter.router(options);

export { ApiRouter, CyberiaActionRouter };
