import express from 'express';
import rateLimit from 'express-rate-limit';
import { IDENTITY_PREVIEW } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { adminGuard, moderatorGuard } from '../../server/security/auth.js';
import { CyberiaPlayerController } from './cyberia-player.controller.js';

/** Operator changes one address may request in a window: a batch counts once. */
const CHANGE_LIMIT = Object.freeze({ windowMs: 15 * 60 * 1000, limit: 120 });

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-player',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    // The game server writes over gRPC. Moderators read profiles, sessions and stacks, and lock
    // accounts; an admin also ends a session, changes the stacks and bans. The operations check the
    // role of each request again. Identity previews are public.
    const router = express.Router();
    router.get(`/appearance/v${IDENTITY_PREVIEW.version}/:cids`, async (req, res) =>
      CyberiaPlayerController.appearance(req, res, context),
    );
    router.get('/identity/:name', async (req, res) => CyberiaPlayerController.identity(req, res, context));
    const moderators = auth.requireModerator;
    router.get('/:id/stacks', ...moderators, async (req, res) => CyberiaPlayerController.stacks(req, res, context));
    router.get('/:id', ...moderators, async (req, res) => CyberiaPlayerController.get(req, res, context));
    router.get('/', ...moderators, async (req, res) => CyberiaPlayerController.get(req, res, context));
    const limited = (guard) => [
      auth.authenticate,
      guard,
      ...(process.env.DISABLE_API_RATE_LIMIT
        ? []
        : [rateLimit({ ...CHANGE_LIMIT, standardHeaders: true, legacyHeaders: false })]),
    ];
    const admins = limited(adminGuard);
    router.post('/:id/session/end', ...admins, async (req, res) =>
      CyberiaPlayerController.endSession(req, res, context),
    );
    router.post('/:id/stacks', ...admins, async (req, res) => CyberiaPlayerController.changeStacks(req, res, context));
    router.post('/:id/account', ...limited(moderatorGuard), async (req, res) =>
      CyberiaPlayerController.restrictAccount(req, res, context),
    );
    router.post('/batch', ...limited(moderatorGuard), async (req, res) =>
      CyberiaPlayerController.batch(req, res, context),
    );
    return router;
  },
};
