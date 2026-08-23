import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaMapService } from './cyberia-map.service.js';

const CyberiaMapController = buildCrudController(CyberiaMapService);

export { CyberiaMapController };
