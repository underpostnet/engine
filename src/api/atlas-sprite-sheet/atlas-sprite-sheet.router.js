import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { moderatorGuard } from '../../server/auth.js';
import { AtlasSpriteSheetController } from './atlas-sprite-sheet.controller.js';

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
    router.get(`/blob/:itemKey`, async (req, res) => await AtlasSpriteSheetController.blob(req, res, options));
    // Metadata endpoints: returns itemKey, atlasWidth, atlasHeight, cellPixelDim, frames (no fileId).
    // Client fetches /metadata/:itemKey once, caches it, then fetches /blob/:itemKey for the PNG.
    router.get(
      `/metadata/:itemKey`,
      async (req, res) => await AtlasSpriteSheetController.getMetadata(req, res, options),
    );
    router.get(`/metadata`, async (req, res) => await AtlasSpriteSheetController.getMetadata(req, res, options));
    return registerCrudRoutes(router, AtlasSpriteSheetController, options);
  }
}

const ApiRouter = (options) => AtlasSpriteSheetRouter.router(options);

export { ApiRouter, AtlasSpriteSheetRouter };
