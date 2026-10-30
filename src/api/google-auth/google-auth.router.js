import express from 'express';
import rateLimit from 'express-rate-limit';
import { Passport } from 'passport';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { userGuard } from '../../server/security/auth.js';
import { GoogleAuthController } from './google-auth.controller.js';
import {
  GOOGLE_AUTH_SCOPES,
  GOOGLE_AUTH_STATUS,
  GoogleAuthService,
  googleAuthConfig,
  returnPath,
} from './google-auth.service.js';

const logger = loggerFactory(import.meta);

class GoogleAuthRouter {
  /**
   * Google sign-in: `GET /?view=` starts it, `GET /callback` is the redirect URI Google lists,
   * `POST /session` exchanges a flow's ticket for a session, and `POST /link` links a flow's
   * Google account to the signed-in user. Each host gets its own Passport instance, and no
   * Passport session.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   * @throws {Error} When the deploy environment does not configure the OAuth client.
   */
  static router(options) {
    const router = express.Router();
    const passport = new Passport();
    passport.use(GoogleAuthService.strategy(options, googleAuthConfig(options)));

    // Production connections build no index on their own; the unique ones keep one user per Google account.
    Promise.resolve()
      .then(() => DataBaseProviderService.getModel('GoogleAuth', options).createIndexes())
      .catch((error) => logger.error('GoogleAuth index build failed', { error: error.message }));

    if (!process.env.DISABLE_API_RATE_LIMIT)
      router.use(
        rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 30,
          standardHeaders: true,
          legacyHeaders: false,
          handler: (req, res) =>
            req.method === 'GET'
              ? res.redirect(returnPath(options, GOOGLE_AUTH_STATUS.error, { view: req.query.view }))
              : res.status(429).json({ status: 'error', message: 'Too many requests, please try again later.' }),
        }),
      );

    router.get(
      '/',
      passport.authenticate('google', { session: false, scope: GOOGLE_AUTH_SCOPES, prompt: 'select_account' }),
    );

    router.get('/callback', (req, res, next) =>
      passport.authenticate('google', { session: false }, (error, identity, info) =>
        GoogleAuthController.callback(req, res, options, { error, identity, info }),
      )(req, res, next),
    );

    router.post('/session', async (req, res) => await GoogleAuthController.session(req, res, options));
    router.post(
      '/link',
      options.authMiddleware,
      userGuard,
      async (req, res) => await GoogleAuthController.link(req, res, options),
    );

    return router;
  }
}

const ApiRouter = (options) => GoogleAuthRouter.router(options);

export { ApiRouter, GoogleAuthRouter };
