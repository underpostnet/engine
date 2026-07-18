import { buildCrudController } from '../../server/middlewares.js';
import { CyberiaQuestProgressService } from './cyberia-quest-progress.service.js';

const CyberiaQuestProgressController = buildCrudController(CyberiaQuestProgressService);

export { CyberiaQuestProgressController };
