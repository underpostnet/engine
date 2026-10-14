import { serviceHandler } from '../../server/network/middlewares.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { GOOGLE_AUTH_STATUS, GoogleAuthService, returnPath } from './google-auth.service.js';

const logger = loggerFactory(import.meta);

class GoogleAuthController {
  static session = serviceHandler(GoogleAuthService.session);
  static link = serviceHandler(GoogleAuthService.link);

  /**
   * Ends a Google callback on the PWA return route: with a session ticket after a sign-in, with
   * the claims to link after a log-in, or with the reason for neither.
   * @param {import('express').Request} req - Express request.
   * @param {import('express').Response} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @param {{error?: Error, identity?: object|false, info?: {link?: object, status?: string}}} outcome - What Passport decided.
   */
  static async callback(req, res, options, { error, identity, info }) {
    const { flow, view } = GoogleAuthService.takeState(req, res, options);
    let status = identity
      ? GOOGLE_AUTH_STATUS.success
      : info?.link
        ? GOOGLE_AUTH_STATUS.link
        : (info?.status ?? GOOGLE_AUTH_STATUS.error);
    if (req.query.error === 'access_denied') status = GOOGLE_AUTH_STATUS.cancelled;
    if (error) logger.error('Google sign-in failed', { error: error.message });
    try {
      if (identity) await GoogleAuthService.issueTicket(req, res, options, identity, flow);
      if (info?.link) GoogleAuthService.holdLink(req, res, options, info.link, flow);
    } catch (resultError) {
      logger.error('Google sign-in result failed', { error: resultError.message });
      status = GOOGLE_AUTH_STATUS.error;
    }
    return res.redirect(returnPath(options, status, { flow, view }));
  }
}

export { GoogleAuthController };
