import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { EventSchedulerService } from './event-scheduler.service.js';

const EventSchedulerController = buildCrudController(EventSchedulerService, {
  get: serviceHandler(EventSchedulerService.get),
});

export { EventSchedulerController };
