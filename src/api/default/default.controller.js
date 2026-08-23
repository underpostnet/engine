import { buildCrudController } from '../../server/network/middlewares.js';
import { DefaultService } from './default.service.js';

const DefaultController = buildCrudController(DefaultService);

export { DefaultController };
