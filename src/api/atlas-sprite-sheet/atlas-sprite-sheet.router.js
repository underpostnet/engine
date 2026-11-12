import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { AtlasSpriteSheetController } from './atlas-sprite-sheet.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'atlas-sprite-sheet',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    // Authoring routes of the host's Studio (`apiExtensions` in conf.server.json).
    context.extension?.mount(router, context);
    router.get(`/blob/:itemKey`, async (req, res) => await AtlasSpriteSheetController.blob(req, res, context));
    // The idle preview of an item (by label) or of a definition (by its cid), for every
    // editor, explorer and overlay that shows one picture of it.
    router.get(
      `/idle-preview/:key`,
      async (req, res) => await AtlasSpriteSheetController.idlePreview(req, res, context),
    );
    // A definition's render, by its cid: the primary render and its metadata as pinned, the
    // upscaled derived render, frames per direction and one direction animated. Every host that
    // holds the definition answers the same.
    router.get(`/layout/:cid`, async (req, res) => await AtlasSpriteSheetController.layout(req, res, context));
    router.get(
      `/render/:cid`,
      async (req, res) => await AtlasSpriteSheetController.definitionRender(req, res, context),
    );
    router.get(
      `/render/:cid/:scale`,
      async (req, res) => await AtlasSpriteSheetController.definitionRender(req, res, context),
    );
    router.get(
      `/frame-counts/:cid`,
      async (req, res) => await AtlasSpriteSheetController.frameCounts(req, res, context),
    );
    router.get(
      `/animation/:cid/:directionCode`,
      async (req, res) => await AtlasSpriteSheetController.animation(req, res, context),
    );
    // Label routes: the metadata of the render an item label is bound to, then its primary PNG.
    // The client fetches /metadata/:itemKey once, caches it, then fetches /blob/:itemKey.
    router.get(
      `/metadata/:itemKey`,
      async (req, res) => await AtlasSpriteSheetController.getMetadata(req, res, context),
    );
    router.get(`/metadata`, async (req, res) => await AtlasSpriteSheetController.getMetadata(req, res, context));
    return registerCrudRoutes(router, AtlasSpriteSheetController, context);
  },
};
