import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { CyberiaDialogueService } from './cyberia-dialogue.service.js';

const CyberiaDialogueController = buildCrudController(CyberiaDialogueService, {
  getByCode: serviceHandler(CyberiaDialogueService.getByCode, { crossOrigin: true, errorStatus: 404 }),
});

export { CyberiaDialogueController };
