import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaSagaController } from './cyberia-saga.controller.js';

class CyberiaSagaRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.get(`/sources`, async (req, res) => await CyberiaSagaController.sources(req, res, options));
    return registerCrudRoutes(router, CyberiaSagaController, options);
  }
}

const ApiRouter = (options) => CyberiaSagaRouter.router(options);

export { ApiRouter, CyberiaSagaRouter };
