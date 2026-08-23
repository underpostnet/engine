import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaEntityService } from './cyberia-entity.service.js';

const CyberiaEntityController = buildCrudController(CyberiaEntityService);

export { CyberiaEntityController };
