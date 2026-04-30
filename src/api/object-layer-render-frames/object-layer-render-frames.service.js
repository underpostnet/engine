import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class ObjectLayerRenderFramesService {
  static post = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;
    return await new ObjectLayerRenderFrames(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;
    if (req.params.id) return await ObjectLayerRenderFrames.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      ObjectLayerRenderFrames.find(query).sort(sort).limit(limit).skip(skip),
      ObjectLayerRenderFrames.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;
    return await ObjectLayerRenderFrames.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.ObjectLayerRenderFrames;
    if (req.params.id) return await ObjectLayerRenderFrames.findByIdAndDelete(req.params.id);
    else return await ObjectLayerRenderFrames.deleteMany();
  };
}

export { ObjectLayerRenderFramesService };
