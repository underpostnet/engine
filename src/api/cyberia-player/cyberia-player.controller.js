import {
  controllerHandler,
  sendBlob,
  serviceHandler,
  setCrossOriginHeaders,
} from '../../server/network/middlewares.js';
import { CyberiaPlayerService } from './cyberia-player.service.js';

class CyberiaPlayerController {
  static get = serviceHandler(CyberiaPlayerService.get);

  static endSession = serviceHandler(CyberiaPlayerService.endSession);

  static stacks = serviceHandler(CyberiaPlayerService.stacks);

  static changeStacks = serviceHandler(CyberiaPlayerService.changeStacks);

  static restrictAccount = serviceHandler(CyberiaPlayerService.restrictAccount);

  static batch = serviceHandler(CyberiaPlayerService.batch);

  // An answer that is no preview is never cached.
  static appearance = controllerHandler(async (req, res, options) => {
    setCrossOriginHeaders(req, res);
    res.set('Cache-Control', 'no-store');
    const { buffer, mimetype, name, etag } = await CyberiaPlayerService.appearance(req, res, options);
    return sendBlob(req, res, { buffer, mimetype, filename: name, etag });
  });

  static identity = controllerHandler(async (req, res, options) => {
    setCrossOriginHeaders(req, res);
    res.set('Cache-Control', 'no-cache');
    return res.redirect(302, await CyberiaPlayerService.identity(req, res, options));
  });
}

export { CyberiaPlayerController };
