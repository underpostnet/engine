import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { InstanceService } from './instance.service.js';

const InstanceController = buildCrudController(InstanceService, {
  get: serviceHandler(InstanceService.get),
});

export { InstanceController };
