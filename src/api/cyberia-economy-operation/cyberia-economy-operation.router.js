import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaEconomyOperationController } from './cyberia-economy-operation.controller.js';

class CyberiaEconomyOperationRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // The game server writes over gRPC; moderators read here.
    const router = express.Router();
    const guards = [options.authMiddleware, moderatorGuard];
    router.get('/:id', ...guards, async (req, res) => CyberiaEconomyOperationController.get(req, res, options));
    router.get('/', ...guards, async (req, res) => CyberiaEconomyOperationController.get(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaEconomyOperationRouter.router(options);

export { ApiRouter, CyberiaEconomyOperationRouter };
