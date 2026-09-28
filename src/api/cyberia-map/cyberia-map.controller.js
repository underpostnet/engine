import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaMapService } from './cyberia-map.service.js';

const CyberiaMapController = buildCrudController(CyberiaMapService, {
  context: serviceHandler(CyberiaMapService.context, { crossOrigin: true }),
});

export { CyberiaMapController };
