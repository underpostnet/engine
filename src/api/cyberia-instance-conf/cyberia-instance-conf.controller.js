import { buildCrudController } from '../../server/middlewares.js';
import { CyberiaInstanceConfService } from './cyberia-instance-conf.service.js';

const CyberiaInstanceConfController = buildCrudController(CyberiaInstanceConfService);

export { CyberiaInstanceConfController };
