import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaItemCatalogService } from './cyberia-item-catalog.service.js';

const CyberiaItemCatalogController = buildCrudController(CyberiaItemCatalogService, {
  reconcile: serviceHandler(CyberiaItemCatalogService.reconcile),
});

export { CyberiaItemCatalogController };
