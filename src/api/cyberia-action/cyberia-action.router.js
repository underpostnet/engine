import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaActionController } from './cyberia-action.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-action',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    // Direct lookup by code. The client fetches an NPC's action metadata
    // (label, dialogue map) by the action code the AOI stream carries.
    router.get(`/code/:code`, async (req, res) => await CyberiaActionController.getByCode(req, res, context));
    router.get(`/:id/diagnostics`, async (req, res) => await CyberiaActionController.diagnostics(req, res, context));
    return registerCrudRoutes(router, CyberiaActionController, context);
  },
};
