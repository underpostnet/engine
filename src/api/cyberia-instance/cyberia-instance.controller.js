import {
  buildCrudController,
  controllerHandler,
  sendBlob,
  serviceHandler,
  setCrossOriginHeaders,
} from '../../server/network/middlewares.js';
import { CyberiaInstanceService } from './cyberia-instance.service.js';
import { CyberiaInstanceMapService } from './cyberia-instance-map.service.js';
import { CyberiaInstanceBootService } from './cyberia-instance-boot.service.js';

const CyberiaInstanceController = buildCrudController(CyberiaInstanceService, {
  // The game client fetches the instance map cross-origin, as it does quests.
  instanceMapStatic: serviceHandler(CyberiaInstanceMapService.getStatic, { crossOrigin: true, errorStatus: 404 }),
  // Node background of one map, rendered server-side and stored as its preview.
  instanceMapPreview: controllerHandler(
    async (req, res, options) => {
      setCrossOriginHeaders(req, res);
      const buffer = await CyberiaInstanceMapService.getPreview(req, res, options);
      return sendBlob(req, res, {
        buffer,
        mimetype: 'image/png',
        filename: `${req.params.mapCode}-preview.png`,
      });
    },
    { errorStatus: 404 },
  ),
  // The preview of a world, revalidated by the key of its maps and cells.
  instanceMapWorldPreview: controllerHandler(
    async (req, res, options) => {
      const { key, png } = await CyberiaInstanceMapService.getWorldPreview(req, res, options);
      return sendBlob(req, res, {
        buffer: png,
        mimetype: 'image/png',
        filename: `${req.params.instanceCode}-world-preview.png`,
        etag: key,
      });
    },
    { errorStatus: 404 },
  ),
  portalConnect: serviceHandler(CyberiaInstanceService.portalConnect),
  // Moderator/admin-triggered world reload on a running cyberia-server.
  hotReload: serviceHandler(CyberiaInstanceService.hotReload, { errorStatus: 502 }),
  // Boot transport (REST fallback of the gRPC CyberiaDataService).
  bootPing: serviceHandler(CyberiaInstanceBootService.ping),
  bootObjectLayerBatch: serviceHandler(CyberiaInstanceBootService.objectLayerBatch, { errorStatus: 500 }),
  bootObjectLayer: serviceHandler(CyberiaInstanceBootService.objectLayer, { errorStatus: 404 }),
  bootItemContent: serviceHandler(CyberiaInstanceBootService.itemContent, { errorStatus: 500 }),
  bootMapData: serviceHandler(CyberiaInstanceBootService.mapData, { errorStatus: 404 }),
  bootFullInstance: serviceHandler(CyberiaInstanceBootService.fullInstance, { errorStatus: 500 }),
  bootObjectLayerManifest: serviceHandler(CyberiaInstanceBootService.objectLayerManifest, { errorStatus: 500 }),
});

export { CyberiaInstanceController };
