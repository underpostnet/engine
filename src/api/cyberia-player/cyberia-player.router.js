import express from 'express';
import { IDENTITY_PREVIEW } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaPlayerController } from './cyberia-player.controller.js';

class CyberiaPlayerRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // The game server writes over gRPC; moderators read here. Identity previews are public.
    const router = express.Router();
    router.get(`/appearance/v${IDENTITY_PREVIEW.version}/:cids`, async (req, res) =>
      CyberiaPlayerController.appearance(req, res, options),
    );
    router.get('/identity/:name', async (req, res) => CyberiaPlayerController.identity(req, res, options));
    const guards = [options.authMiddleware, moderatorGuard];
    router.get('/:id', ...guards, async (req, res) => CyberiaPlayerController.get(req, res, options));
    router.get('/', ...guards, async (req, res) => CyberiaPlayerController.get(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaPlayerRouter.router(options);

export { ApiRouter, CyberiaPlayerRouter };
