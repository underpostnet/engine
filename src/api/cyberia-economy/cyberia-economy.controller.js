import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaEconomyService } from './cyberia-economy.service.js';

const CyberiaEconomyController = buildCrudController(CyberiaEconomyService, {
  contract: serviceHandler(CyberiaEconomyService.contract),
  view: serviceHandler(CyberiaEconomyService.view, { errorStatus: 404 }),
  clone: serviceHandler(CyberiaEconomyService.clone),
});

export { CyberiaEconomyController };
