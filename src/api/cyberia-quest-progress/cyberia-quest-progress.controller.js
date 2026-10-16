import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaQuestProgressService } from './cyberia-quest-progress.service.js';

class CyberiaQuestProgressController {
  static get = serviceHandler(CyberiaQuestProgressService.get, { pagination: true });
}

export { CyberiaQuestProgressController };
