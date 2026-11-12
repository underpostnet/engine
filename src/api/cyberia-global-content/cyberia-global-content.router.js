import express from 'express';
import { CyberiaGlobalContentController } from './cyberia-global-content.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-global-content',
  services: ['database', 'auth'],
  /**
   * An import registers global content; reading and removing a row need a moderator.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const moderator = auth.requireModerator;
    const handle = (method) => async (req, res) => await CyberiaGlobalContentController[method](req, res, context);
    router.get('/', ...moderator, handle('get'));
    router.delete('/:cid', ...moderator, handle('delete'));
    return router;
  },
};
