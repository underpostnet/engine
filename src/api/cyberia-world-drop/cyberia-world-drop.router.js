import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaWorldDropController } from './cyberia-world-drop.controller.js';

class CyberiaWorldDropRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // The game server writes over gRPC; moderators read here.
    const router = express.Router();
    const guards = [options.authMiddleware, moderatorGuard];
    router.get('/:id', ...guards, async (req, res) => CyberiaWorldDropController.get(req, res, options));
    router.get('/', ...guards, async (req, res) => CyberiaWorldDropController.get(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaWorldDropRouter.router(options);

export { ApiRouter, CyberiaWorldDropRouter };
