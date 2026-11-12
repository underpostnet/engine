import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaEntityTypeDefaultController } from './cyberia-entity-type-default.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-entity-type-default',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    // Custom actions first: the generic /:id routes below capture everything.
    router.post(
      `/sync-instance/:instanceCode`,
      auth.requireModerator,
      async (req, res) => await CyberiaEntityTypeDefaultController.sync(req, res, context),
    );
    router.post(
      `/:id/instances`,
      auth.requireModerator,
      async (req, res) => await CyberiaEntityTypeDefaultController.setInstances(req, res, context),
    );
    return registerCrudRoutes(router, CyberiaEntityTypeDefaultController, context);
  },
};
