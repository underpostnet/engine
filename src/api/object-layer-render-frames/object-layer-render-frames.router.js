import { loggerFactory } from '../../server/logger.js';
import { ObjectLayerRenderFramesController } from './object-layer-render-frames.controller.js';
import express from 'express';
import { moderatorGuard, adminGuard } from '../../server/auth.js';

const logger = loggerFactory(import.meta);

class ObjectLayerRenderFramesRouter {
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
      async (req, res) => await ObjectLayerRenderFramesController.post(req, res, options),
    );
    router.post(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await ObjectLayerRenderFramesController.post(req, res, options),
    );
    router.get(
      `/:id`,
      // options.authMiddleware,
      async (req, res) => await ObjectLayerRenderFramesController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await ObjectLayerRenderFramesController.get(req, res, options));
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await ObjectLayerRenderFramesController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await ObjectLayerRenderFramesController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await ObjectLayerRenderFramesController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await ObjectLayerRenderFramesController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => ObjectLayerRenderFramesRouter.router(options);

export { ApiRouter, ObjectLayerRenderFramesRouter };
