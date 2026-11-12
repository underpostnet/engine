import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaDialogueController } from './cyberia-dialogue.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-dialogue',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    // Direct lookup by code, e.g. "default-lain".
    router.get(`/code/:code`, async (req, res) => await CyberiaDialogueController.getByCode(req, res, context));
    return registerCrudRoutes(router, CyberiaDialogueController, context);
  },
};
