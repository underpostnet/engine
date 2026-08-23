import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaGlobalMapCodeRegistryService } from './cyberia-global-map-code-registry.service.js';

const CyberiaGlobalMapCodeRegistryController = buildCrudController(CyberiaGlobalMapCodeRegistryService);

export { CyberiaGlobalMapCodeRegistryController };
