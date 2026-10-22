import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaEconomicItemPolicyService } from './cyberia-economic-item-policy.service.js';

const CyberiaEconomicItemPolicyController = buildCrudController(CyberiaEconomicItemPolicyService, {
  view: serviceHandler(CyberiaEconomicItemPolicyService.view, { pagination: true, errorStatus: 404 }),
});

export { CyberiaEconomicItemPolicyController };
