import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaActionService } from './cyberia-action.service.js';

const CyberiaActionController = buildCrudController(CyberiaActionService, {
  getByCode: serviceHandler(CyberiaActionService.getByCode, { crossOrigin: true, errorStatus: 404 }),
});

export { CyberiaActionController };
