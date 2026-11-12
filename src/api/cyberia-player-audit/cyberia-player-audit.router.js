import express from 'express';
import { CyberiaPlayerAuditController } from './cyberia-player-audit.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-player-audit',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    // The player API writes the trail; moderators read it.
    const router = express.Router();
    router.get('/', auth.requireModerator, async (req, res) => CyberiaPlayerAuditController.get(req, res, context));
    return router;
  },
};
