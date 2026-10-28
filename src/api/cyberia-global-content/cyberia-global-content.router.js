import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaGlobalContentController } from './cyberia-global-content.controller.js';

class CyberiaGlobalContentRouter {
  /**
   * An import registers global content; reading and removing a row need a moderator.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const moderator = [options.authMiddleware, moderatorGuard];
    const handle = (method) => async (req, res) => await CyberiaGlobalContentController[method](req, res, options);
    router.get('/', ...moderator, handle('get'));
    router.delete('/:cid', ...moderator, handle('delete'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaGlobalContentRouter.router(options);

export { ApiRouter, CyberiaGlobalContentRouter };
