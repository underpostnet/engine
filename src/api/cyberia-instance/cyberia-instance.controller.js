import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { CyberiaInstanceService } from './cyberia-instance.service.js';
import { CyberiaInstanceMapService } from './cyberia-instance-map.service.js';

const CyberiaInstanceController = buildCrudController(CyberiaInstanceService, {
  // The C client fetches the instance map cross-origin (same as quest metadata).
  instanceMapStatic: serviceHandler(CyberiaInstanceMapService.getStatic, { crossOrigin: true, errorStatus: 404 }),
  instanceMapDynamic: serviceHandler(CyberiaInstanceMapService.getDynamic, { crossOrigin: true, errorStatus: 404 }),
  fallbackWorld: serviceHandler(CyberiaInstanceService.fallbackWorld),
  portalConnect: serviceHandler(CyberiaInstanceService.portalConnect),
});

export { CyberiaInstanceController };
