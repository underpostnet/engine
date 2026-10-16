import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaPlayerService } from './cyberia-player.service.js';

class CyberiaPlayerController {
  static get = serviceHandler(CyberiaPlayerService.get, { pagination: true });
}

export { CyberiaPlayerController };
