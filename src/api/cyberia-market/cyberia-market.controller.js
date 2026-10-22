import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaMarketService } from './cyberia-market.service.js';

const CyberiaMarketController = buildCrudController(CyberiaMarketService, {
  contract: serviceHandler(CyberiaMarketService.contract),
  view: serviceHandler(CyberiaMarketService.view, { errorStatus: 404 }),
  clone: serviceHandler(CyberiaMarketService.clone),
  reload: serviceHandler(CyberiaMarketService.reload, { errorStatus: 502 }),
});

export { CyberiaMarketController };
