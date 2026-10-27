import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaProceduralPopulationService as Service } from './cyberia-procedural-population.service.js';

const CyberiaProceduralPopulationController = {
  maps: serviceHandler(Service.maps, { pagination: true }),
  mapContext: serviceHandler(Service.mapContext),
  post: serviceHandler(Service.post),
  get: serviceHandler(Service.get, { pagination: true }),
  impact: serviceHandler(Service.impact),
  addTarget: serviceHandler(Service.addTarget),
  updateTarget: serviceHandler(Service.updateTarget),
  removeTarget: serviceHandler(Service.removeTarget),
  resetTarget: serviceHandler(Service.resetTarget),
  forgetRemoved: serviceHandler(Service.forgetRemoved),
  generate: serviceHandler(Service.generate),
  results: serviceHandler(Service.results),
  deleteResults: serviceHandler(Service.deleteResults),
  targetDefinitions: serviceHandler(Service.targetDefinitions, { pagination: true }),
  select: serviceHandler(Service.select),
  retryEntry: serviceHandler(Service.retryEntry),
  palette: serviceHandler(Service.palette),
  draft: serviceHandler(Service.draft),
  rebase: serviceHandler(Service.rebase),
  defaults: serviceHandler(Service.defaults),
  validate: serviceHandler(Service.validate),
  publish: serviceHandler(Service.publish),
  retryPublication: serviceHandler(Service.retryPublication),
  cancelPublication: serviceHandler(Service.cancelPublication),
  cancel: serviceHandler(Service.cancel),
  delete: serviceHandler(Service.delete),
};

export { CyberiaProceduralPopulationController };
