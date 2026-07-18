import { buildCrudController } from '../../server/middlewares.js';
import { DefaultService } from './default.service.js';

const DefaultController = buildCrudController(DefaultService);

export { DefaultController };
