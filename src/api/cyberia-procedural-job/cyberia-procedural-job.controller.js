import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaProceduralJobService } from './cyberia-procedural-job.service.js';

const CyberiaProceduralJobController = {
  post: serviceHandler(CyberiaProceduralJobService.post),
  sources: serviceHandler(CyberiaProceduralJobService.sources, { pagination: true }),
  sourcePalette: serviceHandler(CyberiaProceduralJobService.sourcePalette),
  get: serviceHandler(CyberiaProceduralJobService.get, { pagination: true }),
  getItems: serviceHandler(CyberiaProceduralJobService.getItems, { pagination: true }),
  cancel: serviceHandler(CyberiaProceduralJobService.cancel),
  delete: serviceHandler(CyberiaProceduralJobService.delete),
  regenerate: serviceHandler(CyberiaProceduralJobService.regenerate),
  approve: serviceHandler(CyberiaProceduralJobService.approve),
  reject: serviceHandler(CyberiaProceduralJobService.reject),
  edit: serviceHandler(CyberiaProceduralJobService.edit),
  promote: serviceHandler(CyberiaProceduralJobService.promote),
  promoteJob: serviceHandler(CyberiaProceduralJobService.promoteJob),
};

export { CyberiaProceduralJobController };
