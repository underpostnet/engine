import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaSocialService } from './cyberia-social.service.js';

class CyberiaSocialController {
  static get = serviceHandler(CyberiaSocialService.get, { pagination: true });
}

export { CyberiaSocialController };
