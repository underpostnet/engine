import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaSocialController } from './cyberia-social.controller.js';

class CyberiaSocialRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // The game server writes over gRPC; moderators read here.
    const router = express.Router();
    const guards = [options.authMiddleware, moderatorGuard];
    router.get('/:id', ...guards, async (req, res) => CyberiaSocialController.get(req, res, options));
    router.get('/', ...guards, async (req, res) => CyberiaSocialController.get(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaSocialRouter.router(options);

export { ApiRouter, CyberiaSocialRouter };
