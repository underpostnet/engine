import { buildCrudController } from '../../server/middlewares.js';
import { CyberiaEntityService } from './cyberia-entity.service.js';

const CyberiaEntityController = buildCrudController(CyberiaEntityService);

export { CyberiaEntityController };
