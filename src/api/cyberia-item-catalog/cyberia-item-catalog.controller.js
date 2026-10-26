import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaItemCatalogService } from './cyberia-item-catalog.service.js';

const CyberiaItemCatalogController = buildCrudController(CyberiaItemCatalogService, {
  unbound: serviceHandler(CyberiaItemCatalogService.unbound),
  resolve: serviceHandler(CyberiaItemCatalogService.resolve),
  history: serviceHandler(CyberiaItemCatalogService.history, { crossOrigin: true }),
  diagnostics: serviceHandler(CyberiaItemCatalogService.diagnostics),
  reconcile: serviceHandler(CyberiaItemCatalogService.reconcile),
});

export { CyberiaItemCatalogController };
