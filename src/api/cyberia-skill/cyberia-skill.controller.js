import { buildCrudController } from '../../server/middlewares.js';
import { CyberiaSkillService } from './cyberia-skill.service.js';

const CyberiaSkillController = buildCrudController(CyberiaSkillService);

export { CyberiaSkillController };
