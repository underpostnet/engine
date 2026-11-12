import express from 'express';
import { CyberiaProceduralJobItemController } from './cyberia-procedural-job-item.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-procedural-job-item',
  services: ['database', 'auth'],
  /**
   * Read-only: the engine writes these records, never a request.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaProceduralJobItemController[method](req, res, context);
    router.get(`/:id`, auth.requireModerator, handle('get'));
    router.get(`/`, auth.requireModerator, handle('get'));
    return router;
  },
};
