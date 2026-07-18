import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaActionController } from './cyberia-action.controller.js';

class CyberiaActionRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // Direct lookup by code — the client fetches an NPC's action metadata
    // (label, dialogue map) by the action code the Go server sends over AOI.
    router.get(`/code/:code`, async (req, res) => await CyberiaActionController.getByCode(req, res, options));
    return registerCrudRoutes(router, CyberiaActionController, options);
  }
}

const ApiRouter = (options) => CyberiaActionRouter.router(options);

export { ApiRouter, CyberiaActionRouter };
