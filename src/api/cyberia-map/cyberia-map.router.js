import express from 'express';
import { registerCrudRoutes } from '../../server/middlewares.js';
import { CyberiaMapController } from './cyberia-map.controller.js';

class CyberiaMapRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.get(`/search-codes`, async (req, res) => await CyberiaMapController.get(req, res, options));
    return registerCrudRoutes(router, CyberiaMapController, options);
  }
}

const ApiRouter = (options) => CyberiaMapRouter.router(options);

export { ApiRouter, CyberiaMapRouter };
