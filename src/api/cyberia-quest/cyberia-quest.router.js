import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaQuestController } from './cyberia-quest.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-quest',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    // Direct lookup of quest metadata by code.
    router.get(`/code/:code`, async (req, res) => await CyberiaQuestController.getByCode(req, res, context));
    // Quest offers by binding cell. The client resolves its Quest tab from the
    // interacted entity's cell, with no CyberiaAction lookup.
    router.get(
      `/cell/:mapCode/:cellX/:cellY`,
      async (req, res) => await CyberiaQuestController.getByCell(req, res, context),
    );
    return registerCrudRoutes(router, CyberiaQuestController, context);
  },
};
