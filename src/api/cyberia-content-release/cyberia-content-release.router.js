import express from 'express';
import { CyberiaContentReleaseController } from './cyberia-content-release.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-content-release',
  services: ['database'],
  /**
   * Read-only: the release ledger is written by the operator CLI, never over HTTP.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaContentReleaseController[method](req, res, context);
    router.get(`/active`, handle('get'));
    router.get(`/:id`, handle('get'));
    router.get(`/`, handle('get'));
    return router;
  },
};
