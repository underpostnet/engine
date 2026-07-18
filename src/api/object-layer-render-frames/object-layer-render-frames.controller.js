import { buildCrudController } from '../../server/middlewares.js';
import { ObjectLayerRenderFramesService } from './object-layer-render-frames.service.js';

const ObjectLayerRenderFramesController = buildCrudController(ObjectLayerRenderFramesService);

export { ObjectLayerRenderFramesController };
