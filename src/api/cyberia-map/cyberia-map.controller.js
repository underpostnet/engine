import { buildCrudController, pictureHandler, serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaMapService } from './cyberia-map.service.js';

const CyberiaMapController = buildCrudController(CyberiaMapService, {
  context: serviceHandler(CyberiaMapService.context, { crossOrigin: true }),
  media: serviceHandler(CyberiaMapService.media),
  readMedia: serviceHandler(CyberiaMapService.readMedia),
  preview: pictureHandler(CyberiaMapService.preview, (req) => `${req.params.code}-preview.png`),
  draftPreview: pictureHandler(CyberiaMapService.draftPreview, () => 'draft-preview.png'),
});

export { CyberiaMapController };
