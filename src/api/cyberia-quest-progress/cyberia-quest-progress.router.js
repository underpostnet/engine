import express from 'express';
import { CyberiaQuestProgressController } from './cyberia-quest-progress.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-quest-progress',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    // The game server writes progress over gRPC; moderators read it here.
    const router = express.Router();
    const guards = auth.requireModerator;
    router.get('/:id', ...guards, async (req, res) => CyberiaQuestProgressController.get(req, res, context));
    router.get('/', ...guards, async (req, res) => CyberiaQuestProgressController.get(req, res, context));
    return router;
  },
};
