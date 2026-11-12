/**
 * @module src/api/cyberia-universe
 *
 * Universes: the instances that share player profiles, the layout of their graph and their links.
 *
 * Endpoints:
 *   GET    /api/v1/cyberia-universe[/:code]           the documents
 *   GET    /api/v1/cyberia-universe/:code/view         members with content and availability
 *   GET    /api/v1/cyberia-universe/instance/:code     the view of the universe of one instance
 *   POST   /api/v1/cyberia-universe                    moderator
 *   PUT    /api/v1/cyberia-universe/:id                creator or admin; body names the revision it read
 *   DELETE /api/v1/cyberia-universe/:id                creator or admin
 */

import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaUniverseController } from './cyberia-universe.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-universe',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    router.get(
      '/instance/:instanceCode',
      async (req, res) => await CyberiaUniverseController.ofInstance(req, res, context),
    );
    router.get('/:id/view', async (req, res) => await CyberiaUniverseController.view(req, res, context));
    return registerCrudRoutes(router, CyberiaUniverseController, context);
  },
};
