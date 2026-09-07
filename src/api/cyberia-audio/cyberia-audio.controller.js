import { buildCrudController } from '../../server/network/middlewares.js';
import { CyberiaAudioService } from './cyberia-audio.service.js';

const CyberiaAudioController = buildCrudController(CyberiaAudioService);

export { CyberiaAudioController };
