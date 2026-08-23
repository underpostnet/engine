import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { IpfsService } from './ipfs.service.js';

const IpfsController = buildCrudController(IpfsService, {
  verify: serviceHandler(IpfsService.verify),
});

export { IpfsController };
