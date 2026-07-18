import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaDialogueController } from './cyberia-dialogue.controller.js';

class CyberiaDialogueRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // Direct lookup by code — C client fetches dialogue by code (e.g. "default-lain")
    router.get(`/code/:code`, async (req, res) => await CyberiaDialogueController.getByCode(req, res, options));
    return registerCrudRoutes(router, CyberiaDialogueController, options);
  }
}

const ApiRouter = (options) => CyberiaDialogueRouter.router(options);

export { ApiRouter, CyberiaDialogueRouter };
