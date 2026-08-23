import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaInstanceConfService } from './cyberia-instance-conf.service.js';

const CyberiaInstanceConfController = buildCrudController(CyberiaInstanceConfService);

export { CyberiaInstanceConfController };
