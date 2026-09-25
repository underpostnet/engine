import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { ObjectLayerService } from './object-layer.service.js';

const ObjectLayerController = buildCrudController(ObjectLayerService, {
  get: serviceHandler(ObjectLayerService.get, { crossOrigin: true }),
  lifecycle: serviceHandler(ObjectLayerService.lifecycle),
  purge: serviceHandler(ObjectLayerService.purge),
});

export { ObjectLayerController };
