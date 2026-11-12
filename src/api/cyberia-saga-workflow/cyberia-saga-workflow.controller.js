import { serviceHandler } from '../../server/network/middlewares.js';
import { CyberiaSagaWorkflowService as Service } from './cyberia-saga-workflow.service.js';

const CyberiaSagaWorkflowController = {
  get: serviceHandler(Service.get, { pagination: true }),
  post: serviceHandler(Service.post),
  context: serviceHandler(Service.context),
  generate: serviceHandler(Service.generate),
  generation: serviceHandler(Service.generation),
  cancelGeneration: serviceHandler(Service.cancelGeneration),
  retryGeneration: serviceHandler(Service.retryGeneration),
  candidate: serviceHandler(Service.candidate),
  saveCandidate: serviceHandler(Service.saveCandidate),
  diff: serviceHandler(Service.diff),
  validate: serviceHandler(Service.validate),
  apply: serviceHandler(Service.apply),
  exclusion: serviceHandler(Service.exclusion),
  report: serviceHandler(Service.report),
};

export { CyberiaSagaWorkflowController };
