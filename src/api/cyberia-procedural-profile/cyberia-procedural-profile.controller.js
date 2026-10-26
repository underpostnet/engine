import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaProceduralProfileService } from './cyberia-procedural-profile.service.js';

const CyberiaProceduralProfileController = {
  config: serviceHandler(CyberiaProceduralProfileService.config, { crossOrigin: true }),
  randomSlots: serviceHandler(CyberiaProceduralProfileService.randomSlots, { crossOrigin: true }),
  templatePalette: serviceHandler(CyberiaProceduralProfileService.templatePalette, { crossOrigin: true }),
  importPalette: serviceHandler(CyberiaProceduralProfileService.importPalette, { crossOrigin: true }),
  get: serviceHandler(CyberiaProceduralProfileService.get, { pagination: true, crossOrigin: true }),
  post: serviceHandler(CyberiaProceduralProfileService.post),
};

export { CyberiaProceduralProfileController };
