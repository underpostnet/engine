import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaPlayerAuditController } from './cyberia-player-audit.controller.js';

class CyberiaPlayerAuditRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // The player API writes the trail; moderators read it.
    const router = express.Router();
    router.get('/', options.authMiddleware, moderatorGuard, async (req, res) =>
      CyberiaPlayerAuditController.get(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => CyberiaPlayerAuditRouter.router(options);

export { ApiRouter, CyberiaPlayerAuditRouter };
