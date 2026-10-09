import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaSagaController } from './cyberia-saga.controller.js';

class CyberiaSagaRouter {
  /**
   * Reads, the synchronization preview among them, are public; a synchronization needs a moderator.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const sync = async (req, res) => await CyberiaSagaController.sync(req, res, options);
    router.get(`/sources`, async (req, res) => await CyberiaSagaController.sources(req, res, options));
    router.get(`/sync/:code`, sync);
    router.post(`/sync/:code`, options.authMiddleware, moderatorGuard, sync);
    return registerCrudRoutes(router, CyberiaSagaController, options);
  }
}

const ApiRouter = (options) => CyberiaSagaRouter.router(options);

export { ApiRouter, CyberiaSagaRouter };
