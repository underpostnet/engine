import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaMapController } from './cyberia-map.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-map',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.get(`/search-codes`, async (req, res) => await CyberiaMapController.get(req, res, context));
    router.get(`/context/:code`, async (req, res) => await CyberiaMapController.context(req, res, context));
    // The node background of a stored map (PNG), as the game client and the Studio read it.
    router.get(`/:code/preview`, async (req, res) => await CyberiaMapController.preview(req, res, context));
    router.get(`/:id/media`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Read the preview state of a map'
        #swagger.description = 'Answers { media: { revision, status, error, at }, preview } of the revision the map is at now. Stores nothing.'
        #swagger.path = '/cyberia-map/{id}/media'
        #swagger.method = 'get'
      */
      return await CyberiaMapController.readMedia(req, res, context);
    });
    router.post(`/draft-preview`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Draw a map an editor holds'
        #swagger.description = 'Draws { gridX, gridY, entities } as the preview of a stored map is drawn, saved or not, and answers the PNG, or 204 when it draws nothing. Stores nothing.'
        #swagger.path = '/cyberia-map/draft-preview'
        #swagger.method = 'post'
      */
      return await CyberiaMapController.draftPreview(req, res, context);
    });
    router.post(`/:id/media`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Draw the preview of a map again'
        #swagger.description = 'Draws the preview of the revision the map is at now and answers { media: { revision, status, error, at }, preview }. A failed or pending preview takes this retry.'
        #swagger.path = '/cyberia-map/{id}/media'
        #swagger.method = 'post'
      */
      return await CyberiaMapController.media(req, res, context);
    });
    return registerCrudRoutes(router, CyberiaMapController, context);
  },
};
