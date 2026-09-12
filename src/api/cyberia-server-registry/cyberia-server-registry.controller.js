import crypto from 'crypto';
import { controllerHandler, sendError, sendSuccess } from '../../server/network/middlewares.js';
import { SERVER_TTL_SECONDS } from './cyberia-server-registry.model.js';
import { getLatestServer, reportServer } from './cyberia-server-registry.service.js';

/** Header the game server sends its shared secret in. */
const API_KEY_HEADER = 'x-cyberia-server-api-key';

/** Constant-time secret compare. Unequal lengths are rejected first. */
const secretMatches = (received, expected) => {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

class CyberiaServerRegistryController {
  /**
   * POST / — one server report. The body is `{ serverUrl, instanceCode, name }`
   * and the request carries CYBERIA_SERVER_API_KEY, the shared secret between
   * the engine and the game servers.
   */
  static report = controllerHandler(
    async (req, res, options) => {
      // Fail closed: an engine with no configured secret accepts no report.
      const apiKey = process.env.CYBERIA_SERVER_API_KEY || '';
      if (!apiKey) return sendError(res, new Error('server registry is not configured'), 503);
      if (!secretMatches(req.headers[API_KEY_HEADER], apiKey)) {
        return sendError(res, new Error('unauthorized'), 401);
      }

      const server = await reportServer(req.body || {}, options);
      return sendSuccess(res, { ttlSeconds: SERVER_TTL_SECONDS, server });
    },
    { errorStatus: 400 },
  );

  /**
   * GET / — the most recent live server. The client dials `data.url` and has
   * no other source for it, so this read carries no key.
   */
  static latest = controllerHandler(async (req, res, options) => {
    const server = await getLatestServer(options);
    if (!server) return sendError(res, new Error('no server available'), 404);
    // ponytail: the registry key is the http(s) origin players dial, so the
    // websocket endpoint derives from it. Store the ws form if it ever diverges.
    return sendSuccess(res, { ...server, url: `${server.serverUrl.replace(/^http/, 'ws')}/ws` });
  });
}

export { CyberiaServerRegistryController, API_KEY_HEADER };
