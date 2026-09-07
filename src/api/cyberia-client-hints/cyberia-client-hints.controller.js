import { controllerHandler, sendSuccess } from '../../server/network/middlewares.js';
import { CYBERIA_CLIENT_HINTS_DEFAULTS } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { resolveClientHints } from './cyberia-client-hints.service.js';

class CyberiaClientHintsController {
  static getByCode = controllerHandler(
    async (req, res, options) => {
      const { data, source } = await resolveClientHints(req.params.code, {
        host: options.host || 'default',
        path: options.path || '/',
      });
      // Diagnostic header: which source answered this request.
      res.setHeader('X-Cyberia-Hints-Source', source);
      return sendSuccess(res, data);
    },
    { errorStatus: 500 },
  );

  static getDefaults = controllerHandler(async (req, res, options) => {
    res.setHeader('X-Cyberia-Hints-Source', 'defaults');
    return sendSuccess(res, CYBERIA_CLIENT_HINTS_DEFAULTS);
  });
}

export { CyberiaClientHintsController };
