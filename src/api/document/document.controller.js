import { buildCrudController, serviceHandler } from '../../server/network/middlewares.js';
import { DocumentService } from './document.service.js';

const DocumentController = buildCrudController(DocumentService, {
  get: serviceHandler(DocumentService.get),
  getBySlug: serviceHandler(DocumentService.getBySlug, { crossOrigin: true }),
  patch: serviceHandler(DocumentService.patch),
});

export { DocumentController };
