import { controllerHandler, sendError, sendSuccess } from '../../server/network/middlewares.js';
import { SERVER_TTL_SECONDS } from './cyberia-server-registry.model.js';
import { getLatestServer, reportServer } from './cyberia-server-registry.service.js';

class CyberiaServerRegistryController {
  /**
   * POST / — one server report. The body is `{ serverUrl, instanceCode, name, draining }`;
   * the route's guard checks CYBERIA_SERVER_API_KEY, the shared secret between the engine
   * and the game servers.
   */
  static report = controllerHandler(
    async (req, res, options) => {
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

export { CyberiaServerRegistryController };
