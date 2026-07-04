import { loggerFactory } from '../../server/logger.js';
import { CyberiaDialogueController } from './cyberia-dialogue.controller.js';
import express from 'express';
import { moderatorGuard, adminGuard } from '../../server/auth.js';

const logger = loggerFactory(import.meta);

class CyberiaDialogueRouter {
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
      async (req, res) => await CyberiaDialogueController.post(req, res, options),
    );
    router.post(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaDialogueController.post(req, res, options),
    );
    // Direct lookup by code — C client fetches dialogue by code (e.g. "default-lain")
    router.get(`/code/:code`, async (req, res) => await CyberiaDialogueController.getByCode(req, res, options));
    router.get(
      `/:id`,
      // options.authMiddleware,
      async (req, res) => await CyberiaDialogueController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await CyberiaDialogueController.get(req, res, options));
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaDialogueController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaDialogueController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaDialogueController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await CyberiaDialogueController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => CyberiaDialogueRouter.router(options);

export { ApiRouter, CyberiaDialogueRouter };
