import express from 'express';
import { adminGuard, moderatorGuard } from '../../server/security/auth.js';
import { CyberiaGlobalMapCodeRegistryController } from './cyberia-global-map-code-registry.controller.js';

class CyberiaGlobalMapCodeRegistryRouter {
  /**
   * The registry has one writer, the catalog writes: owner resolution is public, the rows are for
   * moderators and a reconciliation is for admins.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const handle = (method) => async (req, res) =>
      await CyberiaGlobalMapCodeRegistryController[method](req, res, options);
    router.post('/reconcile', options.authMiddleware, adminGuard, handle('reconcile'));
    router.get('/', options.authMiddleware, moderatorGuard, handle('get'));
    router.get('/:mapCode', handle('resolve'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaGlobalMapCodeRegistryRouter.router(options);

export { ApiRouter, CyberiaGlobalMapCodeRegistryRouter };
