import { buildCrudController } from '../../server/middlewares.js';
import { CyberiaGlobalMapCodeRegistryService } from './cyberia-global-map-code-registry.service.js';

const CyberiaGlobalMapCodeRegistryController = buildCrudController(CyberiaGlobalMapCodeRegistryService);

export { CyberiaGlobalMapCodeRegistryController };
