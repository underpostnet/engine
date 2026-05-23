import { adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CoreController } from './core.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class CoreRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.post(req, res, options));
    router.post(`/`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.post(req, res, options));
    router.get(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.get(req, res, options));
    router.get(`/`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.get(req, res, options));
    router.put(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.put(req, res, options));
    router.put(`/`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.put(req, res, options));
    router.delete(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.delete(req, res, options));
    router.delete(`/`, options.authMiddleware, adminGuard, async (req, res) => await CoreController.delete(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CoreRouter.router(options);

export { ApiRouter, CoreRouter };
