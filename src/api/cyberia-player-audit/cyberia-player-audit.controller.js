import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaPlayerAuditService } from './cyberia-player-audit.service.js';

class CyberiaPlayerAuditController {
  static get = serviceHandler(CyberiaPlayerAuditService.get);
}

export { CyberiaPlayerAuditController };
