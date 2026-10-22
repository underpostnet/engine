import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaEconomyOperationService } from './cyberia-economy-operation.service.js';

class CyberiaEconomyOperationController {
  static get = serviceHandler(CyberiaEconomyOperationService.get, { pagination: true });
}

export { CyberiaEconomyOperationController };
