import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { fromWire, toWire } from '../../client/components/objectlayer-studio/RenderSource.js';

/** A stored editor source as the API answers it: its identity and revision, frames as base64. */
const wireOf = (Model, stored) => ({
  _id: stored._id,
  objectLayerCid: stored.objectLayerCid,
  revision: stored.revision,
  ...toWire(Model.sourceOf(stored)),
});

class ObjectLayerRenderFramesService {
  /** POST: stores the editor source a body carries in wire form for `objectLayerCid`. */
  static post = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
    return wireOf(
      ObjectLayerRenderFrames,
      await ObjectLayerRenderFrames.materialize(req.body.objectLayerCid, fromWire(req.body)),
    );
  };
  static get = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
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
  /** PUT: replaces the editor source when the body's `revision` is the stored one; 409 otherwise. */
  static put = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
    return wireOf(
      ObjectLayerRenderFrames,
      await ObjectLayerRenderFrames.replaceAt(req.params.id, fromWire(req.body), req.body.revision),
    );
  };
  static delete = async (req, res, options) => {
    /** @type {import('./object-layer-render-frames.model.js').ObjectLayerRenderFramesModel} */
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
    if (req.params.id) return await ObjectLayerRenderFrames.findByIdAndDelete(req.params.id);
    else return await ObjectLayerRenderFrames.deleteMany();
  };
}

export { ObjectLayerRenderFramesService };
