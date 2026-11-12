import express from 'express';
import { CyberiaGlobalMapCodeRegistryController } from './cyberia-global-map-code-registry.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-global-map-code-registry',
  services: ['database', 'auth'],
  /**
   * The registry has one writer, the catalog writes: owner resolution is public, the rows are for
   * moderators and a reconciliation is for admins.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const handle = (method) => async (req, res) =>
      await CyberiaGlobalMapCodeRegistryController[method](req, res, context);
    router.post('/reconcile', auth.requireAdmin, handle('reconcile'));
    router.get('/', auth.requireModerator, handle('get'));
    router.get('/:mapCode', handle('resolve'));
    return router;
  },
};
