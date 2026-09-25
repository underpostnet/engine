import express from 'express';
import { CyberiaContentReleaseController } from './cyberia-content-release.controller.js';

class CyberiaContentReleaseRouter {
  /**
   * Read-only: the release ledger is written by the operator CLI, never over HTTP.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaContentReleaseController[method](req, res, options);
    router.get(`/active`, handle('get'));
    router.get(`/:id`, handle('get'));
    router.get(`/`, handle('get'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaContentReleaseRouter.router(options);

export { ApiRouter, CyberiaContentReleaseRouter };
