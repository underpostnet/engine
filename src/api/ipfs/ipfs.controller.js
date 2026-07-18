import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { IpfsService } from './ipfs.service.js';

const IpfsController = buildCrudController(IpfsService, {
  verify: serviceHandler(IpfsService.verify),
});

export { IpfsController };
