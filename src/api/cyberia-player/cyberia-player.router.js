import express from 'express';
import rateLimit from 'express-rate-limit';
import { IDENTITY_PREVIEW } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { adminGuard, moderatorGuard } from '../../server/security/auth.js';
import { CyberiaPlayerController } from './cyberia-player.controller.js';

/** Session ends one operator address may request in a window. */
const END_LIMIT = Object.freeze({ windowMs: 15 * 60 * 1000, limit: 30 });

class CyberiaPlayerRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    // The game server writes over gRPC. Moderators read profiles and sessions; an admin ends a
    // session. Identity previews are public.
    const router = express.Router();
    router.get(`/appearance/v${IDENTITY_PREVIEW.version}/:cids`, async (req, res) =>
      CyberiaPlayerController.appearance(req, res, options),
    );
    router.get('/identity/:name', async (req, res) => CyberiaPlayerController.identity(req, res, options));
    const moderators = [options.authMiddleware, moderatorGuard];
    router.get('/:id', ...moderators, async (req, res) => CyberiaPlayerController.get(req, res, options));
    router.get('/', ...moderators, async (req, res) => CyberiaPlayerController.get(req, res, options));
    const ends = [options.authMiddleware, adminGuard];
    if (!process.env.DISABLE_API_RATE_LIMIT)
      ends.push(rateLimit({ ...END_LIMIT, standardHeaders: true, legacyHeaders: false }));
    router.post('/:id/session/end', ...ends, async (req, res) => CyberiaPlayerController.endSession(req, res, options));
    return router;
  }
}

const ApiRouter = (options) => CyberiaPlayerRouter.router(options);

export { ApiRouter, CyberiaPlayerRouter };
