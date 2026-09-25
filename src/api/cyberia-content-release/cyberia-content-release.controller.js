import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaContentReleaseService } from './cyberia-content-release.service.js';

const CyberiaContentReleaseController = buildCrudController(CyberiaContentReleaseService);

export { CyberiaContentReleaseController };
