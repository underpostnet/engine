import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaMarketClaimService } from './cyberia-market-claim.service.js';

class CyberiaMarketClaimController {
  static get = serviceHandler(CyberiaMarketClaimService.get, { pagination: true });
}

export { CyberiaMarketClaimController };
