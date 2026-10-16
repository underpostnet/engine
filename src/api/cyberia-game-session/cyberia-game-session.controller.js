import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaGameSessionService } from './cyberia-game-session.service.js';

class CyberiaGameSessionController {
  static get = serviceHandler(CyberiaGameSessionService.get, { pagination: true });
}

export { CyberiaGameSessionController };
