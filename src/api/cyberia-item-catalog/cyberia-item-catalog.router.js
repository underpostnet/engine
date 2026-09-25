import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaItemCatalogController } from './cyberia-item-catalog.controller.js';

class CyberiaItemCatalogRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const write = [options.authMiddleware, moderatorGuard];
    const handle = (method) => async (req, res) => await CyberiaItemCatalogController[method](req, res, options);
    router.get(`/:id`, handle('get'));
    router.get(`/`, handle('get'));
    router.post(`/reconcile`, ...write, handle('reconcile'));
    router.post(`/`, ...write, handle('post'));
    router.delete(`/:id`, ...write, handle('delete'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaItemCatalogRouter.router(options);

export { ApiRouter, CyberiaItemCatalogRouter };
