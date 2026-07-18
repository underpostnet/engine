import { buildCrudController, serviceHandler } from '../../server/middlewares.js';
import { CompanyService } from './company.service.js';

const CompanyController = buildCrudController(CompanyService, {
  get: serviceHandler(CompanyService.get),
});

export { CompanyController };
