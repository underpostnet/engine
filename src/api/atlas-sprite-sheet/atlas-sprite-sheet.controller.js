import {
  buildCrudController,
  controllerHandler,
  sendBlob,
  serviceHandler,
  setCrossOriginHeaders,
} from '../../server/middlewares.js';
import { AtlasSpriteSheetService } from './atlas-sprite-sheet.service.js';

const AtlasSpriteSheetController = buildCrudController(AtlasSpriteSheetService, {
  get: serviceHandler(AtlasSpriteSheetService.get, { crossOrigin: true, pagination: true }),
  getMetadata: serviceHandler(AtlasSpriteSheetService.getMetadata, {
    crossOrigin: true,
    pagination: true,
    errorStatus: 404,
  }),
  generate: serviceHandler(AtlasSpriteSheetService.generate, { errorStatus: 500 }),
  deleteByObjectLayerId: serviceHandler(AtlasSpriteSheetService.deleteByObjectLayerId, { errorStatus: 500 }),
  blob: controllerHandler(
    async (req, res, options) => {
      // Set before the service call so cross-origin clients can read 404s too.
      setCrossOriginHeaders(req, res);
      const { buffer, mimetype, name } = await AtlasSpriteSheetService.blob(req, res, options);
      return sendBlob(req, res, { buffer, mimetype, filename: name });
    },
    { errorStatus: 404 },
  ),
});

export { AtlasSpriteSheetController };
