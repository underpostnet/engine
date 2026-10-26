import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaProceduralProfileController } from './cyberia-procedural-profile.controller.js';

class CyberiaProceduralProfileRouter {
  /**
   * Reads, the configuration among them, are public; storing a profile needs a moderator.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const handle = (method) => async (req, res) => await CyberiaProceduralProfileController[method](req, res, options);
    router.get(`/config`, handle('config'));
    router.get(`/templates/:id/random-slots`, handle('randomSlots'));
    router.get(`/templates/:id/palette`, handle('templatePalette'));
    router.get(`/import-palette`, handle('importPalette'));
    router.get(`/:id`, handle('get'));
    router.get(`/`, handle('get'));
    router.post(`/`, options.authMiddleware, moderatorGuard, handle('post'));
    return router;
  }
}

const ApiRouter = (options) => CyberiaProceduralProfileRouter.router(options);

export { ApiRouter, CyberiaProceduralProfileRouter };
