import { controllerHandler, sendSuccess, serviceHandler } from '../../server/network/middlewares.js';
import { SERVER_REPORT_SECONDS, SERVER_TTL_SECONDS } from './cyberia-server-registry.model.js';
import { liveEndpoints, liveServers, reportServer } from './cyberia-server-registry.service.js';

class CyberiaServerRegistryController {
  /** POST / — one report of one game server process. */
  static report = controllerHandler(async (req, res, options) => {
    const { stale, server } = await reportServer(req.body || {}, options);
    return sendSuccess(res, { reportSeconds: SERVER_REPORT_SECONDS, ttlSeconds: SERVER_TTL_SECONDS, stale, server });
  });

  /** GET / — the logical endpoints of the live worlds. Public: no process names, no addresses. */
  static endpoints = serviceHandler(async (req, res, options) => await liveEndpoints(options), { crossOrigin: true });

  /** GET /servers — every live process. */
  static servers = serviceHandler(async (req, res, options) => await liveServers(options));
}

export { CyberiaServerRegistryController };
