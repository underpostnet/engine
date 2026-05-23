import { adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { InstanceController } from './instance.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class InstanceRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await InstanceController.post(req, res, options));
    router.post(`/`, options.authMiddleware, adminGuard, async (req, res) => await InstanceController.post(req, res, options));
    router.get(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await InstanceController.get(req, res, options));
    router.get(`/`, options.authMiddleware, async (req, res) => await InstanceController.get(req, res, options));
    router.put(`/:id`, options.authMiddleware, adminGuard, async (req, res) => await InstanceController.put(req, res, options));
    router.put(`/`, options.authMiddleware, adminGuard, async (req, res) => await InstanceController.put(req, res, options));
    router.delete(
      `/:id`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await InstanceController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await InstanceController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => InstanceRouter.router(options);

export { ApiRouter, InstanceRouter };
