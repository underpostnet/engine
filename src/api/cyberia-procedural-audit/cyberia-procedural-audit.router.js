import express from 'express';
import { CyberiaProceduralAuditController } from './cyberia-procedural-audit.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-procedural-audit',
  services: ['database', 'auth'],
  /**
   * Read-only: the engine writes these records, never a request.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaProceduralAuditController[method](req, res, context);
    router.get(`/`, auth.requireModerator, handle('get'));
    return router;
  },
};
