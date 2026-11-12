import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaContentLifecycleService } from './cyberia-content-lifecycle.service.js';

const CyberiaContentLifecycleController = buildCrudController(CyberiaContentLifecycleService, {
  runtime: serviceHandler(CyberiaContentLifecycleService.runtime, { errorStatus: 503 }),
});

export { CyberiaContentLifecycleController };
