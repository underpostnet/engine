import {
  buildCrudController,
  controllerHandler,
  sendBlob,
  serviceHandler,
  setCrossOriginHeaders,
} from '../../server/network/middlewares.js';
import { CyberiaMapService } from './cyberia-map.service.js';

/** A PNG a service draws: the picture, or 204 when it draws nothing. */
const picture = (draw, filename) =>
  controllerHandler(
    async (req, res, options) => {
      const buffer = await draw(req, res, options);
      if (!buffer) {
        setCrossOriginHeaders(req, res);
        return res.status(204).end();
      }
      return sendBlob(req, res, { buffer, mimetype: 'image/png', filename: filename(req) });
    },
    { errorStatus: 404 },
  );

const CyberiaMapController = buildCrudController(CyberiaMapService, {
  context: serviceHandler(CyberiaMapService.context, { crossOrigin: true }),
  media: serviceHandler(CyberiaMapService.media),
  readMedia: serviceHandler(CyberiaMapService.readMedia),
  preview: picture(CyberiaMapService.preview, (req) => `${req.params.code}-preview.png`),
  draftPreview: picture(CyberiaMapService.draftPreview, () => 'draft-preview.png'),
});

export { CyberiaMapController };
