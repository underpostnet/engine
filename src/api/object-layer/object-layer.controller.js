import { buildCrudController, controllerHandler, sendBlob, serviceHandler } from '../../server/middlewares.js';
import { ObjectLayerService } from './object-layer.service.js';

const ObjectLayerController = buildCrudController(ObjectLayerService, {
  get: serviceHandler(ObjectLayerService.get, { crossOrigin: true }),
  generateWebp: controllerHandler(async (req, res, options) => {
    const buffer = await ObjectLayerService.generateWebp(req, res, options);
    const { itemType, itemId, directionCode } = req.params;
    return sendBlob(req, res, {
      buffer,
      mimetype: 'image/webp',
      filename: `${itemType}_${itemId}_${directionCode}.webp`,
      disposition: 'attachment',
    });
  }),
});

export { ObjectLayerController };
