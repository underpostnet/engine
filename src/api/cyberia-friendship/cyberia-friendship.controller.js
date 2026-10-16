import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaFriendshipService } from './cyberia-friendship.service.js';

class CyberiaFriendshipController {
  static get = serviceHandler(CyberiaFriendshipService.get, { pagination: true });
}

export { CyberiaFriendshipController };
