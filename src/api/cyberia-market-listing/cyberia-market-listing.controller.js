import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaMarketListingService } from './cyberia-market-listing.service.js';

class CyberiaMarketListingController {
  static get = serviceHandler(CyberiaMarketListingService.get, { pagination: true });
}

export { CyberiaMarketListingController };
