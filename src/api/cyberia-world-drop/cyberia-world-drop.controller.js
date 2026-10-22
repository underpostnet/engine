import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaWorldDropService } from './cyberia-world-drop.service.js';

class CyberiaWorldDropController {
  static get = serviceHandler(CyberiaWorldDropService.get, { pagination: true });
}

export { CyberiaWorldDropController };
