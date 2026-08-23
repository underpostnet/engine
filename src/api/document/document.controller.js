import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { DocumentService } from './document.service.js';

const DocumentController = buildCrudController(DocumentService, {
  get: serviceHandler(DocumentService.get),
  patch: serviceHandler(DocumentService.patch),
});

export { DocumentController };
