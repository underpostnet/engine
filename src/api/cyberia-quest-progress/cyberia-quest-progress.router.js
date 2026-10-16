import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaQuestProgressController } from './cyberia-quest-progress.controller.js';

class CyberiaQuestProgressRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // The game server writes progress over gRPC; moderators read it here.
    const router = express.Router();
    const guards = [options.authMiddleware, moderatorGuard];
    router.get('/:id', ...guards, async (req, res) => CyberiaQuestProgressController.get(req, res, options));
    router.get('/', ...guards, async (req, res) => CyberiaQuestProgressController.get(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaQuestProgressRouter.router(options);

export { ApiRouter, CyberiaQuestProgressRouter };
