import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaProceduralJobItemController } from './cyberia-procedural-job-item.controller.js';

class CyberiaProceduralJobItemRouter {
  /**
   * Read-only: the engine writes these records, never a request.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaProceduralJobItemController[method](req, res, options);
    router.get(`/:id`, options.authMiddleware, moderatorGuard, handle('get'));
    router.get(`/`, options.authMiddleware, moderatorGuard, handle('get'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaProceduralJobItemRouter.router(options);

export { ApiRouter, CyberiaProceduralJobItemRouter };
