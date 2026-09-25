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
      const { buffer, mimetype, name, etag } = await lookup(req, res, options);
      return sendBlob(req, res, { buffer, mimetype, filename: name, etag });
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
  blob: blobHandler(AtlasSpriteSheetService.blob),
  idlePreview: blobHandler(AtlasSpriteSheetService.idlePreview),
  animation: blobHandler(AtlasSpriteSheetService.animation),
  definitionRender: blobHandler(AtlasSpriteSheetService.definitionRender),
  layout: serviceHandler(AtlasSpriteSheetService.layout, { crossOrigin: true, errorStatus: 404 }),
  frameCounts: serviceHandler(AtlasSpriteSheetService.frameCounts, { crossOrigin: true, errorStatus: 404 }),
});

export { AtlasSpriteSheetController };
