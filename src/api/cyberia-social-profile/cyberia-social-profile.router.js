import express from 'express';
import { CyberiaSocialProfileController } from './cyberia-social-profile.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-social-profile',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    // The game server writes over gRPC; moderators read here.
    const router = express.Router();
    const guards = auth.requireModerator;
    router.get('/:id', ...guards, async (req, res) => CyberiaSocialProfileController.get(req, res, context));
    router.get('/', ...guards, async (req, res) => CyberiaSocialProfileController.get(req, res, context));
    return router;
  },
};
