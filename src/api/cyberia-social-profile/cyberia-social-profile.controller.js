import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaSocialProfileService } from './cyberia-social-profile.service.js';

class CyberiaSocialProfileController {
  static get = serviceHandler(CyberiaSocialProfileService.get, { pagination: true });
}

export { CyberiaSocialProfileController };
