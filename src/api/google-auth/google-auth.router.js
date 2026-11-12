import express from 'express';
import rateLimit from 'express-rate-limit';
import { Passport } from 'passport';
import { GoogleAuthController } from './google-auth.controller.js';
import {
  GOOGLE_AUTH_SCOPES,
  GOOGLE_AUTH_STATUS,
  GoogleAuthService,
  googleAuthConfig,
  returnPath,
} from './google-auth.service.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'google-auth',
  services: ['database', 'auth'],
  /**
   * Checks the OAuth client of the host, then builds the unique indexes that keep one user per
   * Google account: production connections build no index on their own.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {Promise<void>}
   * @throws {Error} When the OAuth client is not configured or an index cannot be built.
   */
  initialize: async (context) => {
    googleAuthConfig(context);
    await context.services.database.getModel('GoogleAuth').createIndexes();
  },
  /**
   * Google sign-in: `GET /?view=` starts it, `GET /callback` is the redirect URI Google lists,
   * `POST /session` exchanges a flow's ticket for a session, and `POST /link` links a flow's
   * Google account to the signed-in user. Each host gets its own Passport instance, and no
   * Passport session.
   * @throws {Error} When the deploy environment does not configure the OAuth client.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const passport = new Passport();
    passport.use(GoogleAuthService.strategy(context, googleAuthConfig(context)));

    if (!process.env.DISABLE_API_RATE_LIMIT)
      router.use(
        rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 30,
          standardHeaders: true,
          legacyHeaders: false,
          handler: (req, res) =>
            req.method === 'GET'
              ? res.redirect(returnPath(context, GOOGLE_AUTH_STATUS.error, { view: req.query.view }))
              : res.status(429).json({ status: 'error', message: 'Too many requests, please try again later.' }),
        }),
      );

    router.get(
      '/',
      passport.authenticate('google', { session: false, scope: GOOGLE_AUTH_SCOPES, prompt: 'select_account' }),
    );

    router.get('/callback', (req, res, next) =>
      passport.authenticate('google', { session: false }, (error, identity, info) =>
        GoogleAuthController.callback(req, res, context, { error, identity, info }),
      )(req, res, next),
    );

    router.post('/session', async (req, res) => await GoogleAuthController.session(req, res, context));
    router.post('/link', auth.requireUser, async (req, res) => await GoogleAuthController.link(req, res, context));

    return router;
  },
};
