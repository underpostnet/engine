import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaUniverseService } from './cyberia-universe.service.js';

const CyberiaUniverseController = buildCrudController(CyberiaUniverseService, {
  view: serviceHandler(CyberiaUniverseService.view, { crossOrigin: true, errorStatus: 404 }),
  // The game client reads the universe of its world cross-origin, as it reads the instance map.
  ofInstance: serviceHandler(CyberiaUniverseService.ofInstance, { crossOrigin: true, errorStatus: 404 }),
});

export { CyberiaUniverseController };
