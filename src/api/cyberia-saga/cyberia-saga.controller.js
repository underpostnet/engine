import { buildCrudController } from '../../server/middlewares.js';
import { CyberiaSagaService } from './cyberia-saga.service.js';

const CyberiaSagaController = buildCrudController(CyberiaSagaService);

export { CyberiaSagaController };
