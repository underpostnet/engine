import { loggerFactory } from '../../server/logger.js';
import { AtlasSpriteSheetController } from './atlas-sprite-sheet.controller.js';
import express from 'express';
import { moderatorGuard, adminGuard } from '../../server/auth.js';

const logger = loggerFactory(import.meta);

class AtlasSpriteSheetRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(
      `/generate/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await AtlasSpriteSheetController.generate(req, res, options),
    );
    router.delete(
      `/object-layer/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await AtlasSpriteSheetController.deleteByObjectLayerId(req, res, options),
    );
    router.post(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await AtlasSpriteSheetController.post(req, res, options),
    );
    router.post(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await AtlasSpriteSheetController.post(req, res, options),
    );
    router.get(`/blob/:itemKey`, async (req, res) => await AtlasSpriteSheetController.blob(req, res, options));
    // Metadata endpoints: returns itemKey, atlasWidth, atlasHeight, cellPixelDim, frames (no fileId).
    // Client fetches /metadata/:itemKey once, caches it, then fetches /blob/:itemKey for the PNG.
    router.get(
      `/metadata/:itemKey`,
      async (req, res) => await AtlasSpriteSheetController.getMetadata(req, res, options),
    );
    router.get(`/metadata`, async (req, res) => await AtlasSpriteSheetController.getMetadata(req, res, options));
    router.get(
      `/:id`,
      // options.authMiddleware,
      async (req, res) => await AtlasSpriteSheetController.get(req, res, options),
    );
    router.get(`/`, async (req, res) => await AtlasSpriteSheetController.get(req, res, options));
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await AtlasSpriteSheetController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await AtlasSpriteSheetController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await AtlasSpriteSheetController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      adminGuard,
      async (req, res) => await AtlasSpriteSheetController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => AtlasSpriteSheetRouter.router(options);

export { ApiRouter, AtlasSpriteSheetRouter };
