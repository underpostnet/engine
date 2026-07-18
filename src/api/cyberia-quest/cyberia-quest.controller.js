import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { CyberiaQuestService } from './cyberia-quest.service.js';

const CyberiaQuestController = buildCrudController(CyberiaQuestService, {
  getByCode: serviceHandler(CyberiaQuestService.getByCode, { crossOrigin: true, errorStatus: 404 }),
  getByCell: serviceHandler(CyberiaQuestService.getByCell, { crossOrigin: true, errorStatus: 404 }),
});

export { CyberiaQuestController };
