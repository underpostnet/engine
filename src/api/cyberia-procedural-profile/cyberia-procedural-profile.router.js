import express from 'express';
import { CyberiaProceduralProfileController } from './cyberia-procedural-profile.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-procedural-profile',
  services: ['database', 'auth'],
  /**
   * Reads, the configuration among them, are public; storing a profile needs a moderator.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaProceduralProfileController[method](req, res, context);
    router.get(`/config`, handle('config'));
    router.get(`/templates/:id/random-slots`, handle('randomSlots'));
    router.get(`/templates/:id/palette`, handle('templatePalette'));
    router.get(`/import-palette`, handle('importPalette'));
    router.get(`/:id`, handle('get'));
    router.get(`/`, handle('get'));
    router.post(`/`, auth.requireModerator, handle('post'));
    return router;
  },
};
