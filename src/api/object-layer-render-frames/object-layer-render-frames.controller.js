import { buildCrudController } from '../../server/network/middlewares.js';
import { ObjectLayerRenderFramesService } from './object-layer-render-frames.service.js';

const ObjectLayerRenderFramesController = buildCrudController(ObjectLayerRenderFramesService);

export { ObjectLayerRenderFramesController };
