import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaQuestProgressService } from './cyberia-quest-progress.service.js';

const CyberiaQuestProgressController = buildCrudController(CyberiaQuestProgressService);

export { CyberiaQuestProgressController };
