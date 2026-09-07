import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaMapAudioConfController } from './cyberia-map-audio-conf.controller.js';

class CyberiaMapAudioConfRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();

    // Map-code routes are registered before the CRUD routes: the generic `/:id`
    // handlers capture every single-segment path once they are mounted.
    router.get(
      '/map-code/:mapCode',
      async (req, res) => await CyberiaMapAudioConfController.getByMapCode(req, res, options),
    );
    router.post(
      '/map-code/:mapCode',
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await CyberiaMapAudioConfController.assign(req, res, options),
    );

    return registerCrudRoutes(router, CyberiaMapAudioConfController, options);
  }
}

const ApiRouter = (options) => CyberiaMapAudioConfRouter.router(options);

export { ApiRouter, CyberiaMapAudioConfRouter };
