/**
 * The internal shared secret between engine-cyberia and the game servers, CYBERIA_SERVER_API_KEY.
 * It travels in the `X-Cyberia-Server-Api-Key` header, server to server, never to a game client.
 *
 * @module src/projects/cyberia/server-key.js
 * @namespace CyberiaServerKey
 */
import crypto from 'crypto';

/** Header the game server and the engine send the secret in. */
export const SERVER_API_KEY_HEADER = 'x-cyberia-server-api-key';

/**
 * The configured secret; empty when the deploy has not configured one.
 * @returns {string}
 * @memberof CyberiaServerKey
 */
export const serverApiKey = () => process.env.CYBERIA_SERVER_API_KEY || '';

/**
 * Whether a received value is the secret. Constant time; an unset secret matches nothing.
 * @param {string} received
 * @returns {boolean}
 * @memberof CyberiaServerKey
 */
export const isServerApiKey = (received) => {
  const expected = Buffer.from(serverApiKey());
  const given = Buffer.from(String(received || ''));
  return expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

/**
 * Express guard of a route only a game server calls. Fails closed: an engine with no configured
 * secret accepts nothing.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @memberof CyberiaServerKey
 */
export const serverKeyGuard = (req, res, next) => {
  if (!serverApiKey()) return res.status(503).json({ status: 'error', message: 'server key is not configured' });
  if (!isServerApiKey(req.headers[SERVER_API_KEY_HEADER]))
    return res.status(401).json({ status: 'error', message: 'unauthorized' });
  return next();
};
