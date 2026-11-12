import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaSagaService } from './cyberia-saga.service.js';

const CyberiaSagaController = buildCrudController(CyberiaSagaService, {
  sources: serviceHandler(CyberiaSagaService.sources, { crossOrigin: true }),
  sync: serviceHandler(CyberiaSagaService.sync, { crossOrigin: true }),
  report: serviceHandler(CyberiaSagaService.report),
  catalog: serviceHandler(CyberiaSagaService.catalog),
});

export { CyberiaSagaController };
