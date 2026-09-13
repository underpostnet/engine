import {
  buildCrudController,
  controllerHandler,
  sendBlob,
  serviceHandler,
  setCrossOriginHeaders,
} from '../../server/network/middlewares.js';
import { AtlasSpriteSheetService } from './atlas-sprite-sheet.service.js';

/* Streams one render as a file. Headers go on before the lookup, so a cross-origin
 * client can read a 404 too. */
const blobHandler = (lookup) =>
  controllerHandler(
    async (req, res, options) => {
      setCrossOriginHeaders(req, res);
      const { buffer, mimetype, name } = await lookup(req, res, options);
      return sendBlob(req, res, { buffer, mimetype, filename: name });
    },
    { errorStatus: 404 },
  );

const AtlasSpriteSheetController = buildCrudController(AtlasSpriteSheetService, {
  get: serviceHandler(AtlasSpriteSheetService.get, { crossOrigin: true, pagination: true }),
  getMetadata: serviceHandler(AtlasSpriteSheetService.getMetadata, {
    crossOrigin: true,
    pagination: true,
    errorStatus: 404,
  }),
  generate: serviceHandler(AtlasSpriteSheetService.generate, { errorStatus: 500 }),
  deleteByObjectLayerId: serviceHandler(AtlasSpriteSheetService.deleteByObjectLayerId, { errorStatus: 500 }),
  blob: blobHandler(AtlasSpriteSheetService.blob),
  idlePreview: blobHandler(AtlasSpriteSheetService.idlePreview),
});

export { AtlasSpriteSheetController };
