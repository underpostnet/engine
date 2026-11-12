import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaContentLifecycleEventService } from './cyberia-content-lifecycle-event.service.js';

const CyberiaContentLifecycleEventController = buildCrudController(CyberiaContentLifecycleEventService);

export { CyberiaContentLifecycleEventController };
