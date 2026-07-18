import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { CoreService } from './core.service.js';

const CoreController = buildCrudController(CoreService, {
  get: serviceHandler(CoreService.get),
});

export { CoreController };
