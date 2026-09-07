import {
  buildCrudController,
  controllerHandler,
  sendSuccess,
  setCrossOriginHeaders,
} from '../../server/network/middlewares.js';
import { CyberiaMapAudioConfService } from './cyberia-map-audio-conf.service.js';

const context = (options) => ({ host: options.host || 'default', path: options.path || '/' });

const CyberiaMapAudioConfController = buildCrudController(CyberiaMapAudioConfService, {
  // Read by map code: the browser client's own path into this API, so it carries the same
  // public-read cross-origin policy the generated CRUD reads do.
  getByMapCode: controllerHandler(
    async (req, res, options) => {
      setCrossOriginHeaders(req, res);
      return sendSuccess(res, await CyberiaMapAudioConfService.getByMapCode(req.params.mapCode, context(options)));
    },
    { errorStatus: 500 },
  ),
  assign: controllerHandler(
    async (req, res, options) =>
      sendSuccess(
        res,
        await CyberiaMapAudioConfService.assign({ ...req.body, mapCode: req.params.mapCode }, context(options)),
      ),
    { errorStatus: 400 },
  ),
});

export { CyberiaMapAudioConfController };
