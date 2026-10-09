import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaProceduralJobItemService } from './cyberia-procedural-job-item.service.js';

const CyberiaProceduralJobItemController = {
  get: serviceHandler(CyberiaProceduralJobItemService.get, { pagination: true }),
};

export { CyberiaProceduralJobItemController };
