import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { AtlasSpriteSheetController } from './atlas-sprite-sheet.controller.js';

class AtlasSpriteSheetRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // Authoring routes of the host's Studio (`apiExtensions` in conf.server.json).
    options.extension?.mount(router, options);
    router.get(`/blob/:itemKey`, async (req, res) => await AtlasSpriteSheetController.blob(req, res, options));
    // The idle preview of an item (by label) or of a definition (by its cid), for every
    // editor, explorer and overlay that shows one picture of it.
    router.get(
      `/idle-preview/:key`,
      async (req, res) => await AtlasSpriteSheetController.idlePreview(req, res, options),
    );
    // A definition's render, by its cid: the primary render and its metadata as pinned, the
    // upscaled derived render, frames per direction and one direction animated. Every host that
    // holds the definition answers the same.
    router.get(`/layout/:cid`, async (req, res) => await AtlasSpriteSheetController.layout(req, res, options));
    router.get(
      `/render/:cid`,
      async (req, res) => await AtlasSpriteSheetController.definitionRender(req, res, options),
    );
    router.get(
      `/render/:cid/:scale`,
      async (req, res) => await AtlasSpriteSheetController.definitionRender(req, res, options),
    );
    router.get(
      `/frame-counts/:cid`,
      async (req, res) => await AtlasSpriteSheetController.frameCounts(req, res, options),
    );
    router.get(
      `/animation/:cid/:directionCode`,
      async (req, res) => await AtlasSpriteSheetController.animation(req, res, options),
    );
    // Label routes: the metadata of the render an item label is bound to, then its primary PNG.
    // The client fetches /metadata/:itemKey once, caches it, then fetches /blob/:itemKey.
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
