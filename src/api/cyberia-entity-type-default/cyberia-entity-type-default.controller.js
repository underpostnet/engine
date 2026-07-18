import { buildCrudController } from '../../server/middlewares.js';
import { CyberiaEntityTypeDefaultService } from './cyberia-entity-type-default.service.js';

const CyberiaEntityTypeDefaultController = buildCrudController(CyberiaEntityTypeDefaultService);

export { CyberiaEntityTypeDefaultController };
