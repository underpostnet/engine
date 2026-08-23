import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CronService } from './cron.service.js';

const CronController = buildCrudController(CronService, {
  get: serviceHandler(CronService.get),
});

export { CronController };
