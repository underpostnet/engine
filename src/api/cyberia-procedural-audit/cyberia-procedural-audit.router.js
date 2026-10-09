import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaProceduralAuditController } from './cyberia-procedural-audit.controller.js';

class CyberiaProceduralAuditRouter {
  /**
   * Read-only: the engine writes these records, never a request.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaProceduralAuditController[method](req, res, options);
    router.get(`/`, options.authMiddleware, moderatorGuard, handle('get'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaProceduralAuditRouter.router(options);

export { ApiRouter, CyberiaProceduralAuditRouter };
