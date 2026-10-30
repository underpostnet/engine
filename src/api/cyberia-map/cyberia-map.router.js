import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaMapController } from './cyberia-map.controller.js';

class CyberiaMapRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.get(`/search-codes`, async (req, res) => await CyberiaMapController.get(req, res, options));
    router.get(`/context/:code`, async (req, res) => await CyberiaMapController.context(req, res, options));
    // The node background of a stored map (PNG), as the game client and the Studio read it.
    router.get(`/:code/preview`, async (req, res) => await CyberiaMapController.preview(req, res, options));
    router.get(`/:id/media`, options.authMiddleware, moderatorGuard, async (req, res) => {
      /*
        #swagger.summary = 'Read the preview state of a map'
        #swagger.description = 'Answers { media: { revision, status, error, at }, preview } of the revision the map is at now. Stores nothing.'
        #swagger.path = '/cyberia-map/{id}/media'
        #swagger.method = 'get'
      */
      return await CyberiaMapController.readMedia(req, res, options);
    });
    router.post(`/draft-preview`, options.authMiddleware, moderatorGuard, async (req, res) => {
      /*
        #swagger.summary = 'Draw a map an editor holds'
        #swagger.description = 'Draws { gridX, gridY, entities } as the preview of a stored map is drawn, saved or not, and answers the PNG, or 204 when it draws nothing. Stores nothing.'
        #swagger.path = '/cyberia-map/draft-preview'
        #swagger.method = 'post'
      */
      return await CyberiaMapController.draftPreview(req, res, options);
    });
    router.post(`/:id/media`, options.authMiddleware, moderatorGuard, async (req, res) => {
      /*
        #swagger.summary = 'Draw the preview of a map again'
        #swagger.description = 'Draws the preview of the revision the map is at now and answers { media: { revision, status, error, at }, preview }. A failed or pending preview takes this retry.'
        #swagger.path = '/cyberia-map/{id}/media'
        #swagger.method = 'post'
      */
      return await CyberiaMapController.media(req, res, options);
    });
    return registerCrudRoutes(router, CyberiaMapController, options);
  }
}

const ApiRouter = (options) => CyberiaMapRouter.router(options);

export { ApiRouter, CyberiaMapRouter };
