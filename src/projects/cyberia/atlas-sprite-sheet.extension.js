/**
 * Cyberia Studio routes of the atlas API: regenerate the render of a definition and publish the
 * definition that names it through the Object Layer authority, rebinding the label, or remove a
 * definition's atlas from this host. The host declares it in `conf.server.json` as
 * `apiExtensions: { "atlas-sprite-sheet": "cyberia" }`.
 *
 * @module src/projects/cyberia/atlas-sprite-sheet.extension.js
 * @namespace CyberiaAtlasStudio
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { serviceHandler } from '../../server/network/middlewares.js';
import { AtlasSpriteSheetStore } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { purgeAtlasDoc } from '../../api/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { ObjectLayerEngine } from './object-layer.js';
import { catalogModels, catalogMounted, findBoundCid } from './object-layer-catalog.js';

/**
 * Atlas authoring handlers of the Cyberia Studio.
 * @memberof CyberiaAtlasStudio
 */
class AtlasStudioService {
  /**
   * POST `/generate/:id`: regenerates the render of a definition from its render frames and
   * publishes the definition that names it; the label is rebound to it.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../../api/types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The definition that names the render.
   */
  static generate = async (req, res, options) => {
    const models = catalogModels(options);
    const objectLayer = await models.ObjectLayer.findById(req.params.id);
    if (!objectLayer) throw new Error('ObjectLayer not found');
    const renderFrames = await DataBaseProviderService.getModel('ObjectLayerRenderFrames', options)
      .findOne({ objectLayerCid: objectLayer.cid })
      .lean();
    if (!renderFrames) throw new Error('ObjectLayer has no render frames');

    const rendered = await AtlasSpriteSheetStore.build({
      itemKey: objectLayer.data.item.id,
      objectLayerRenderFrames: renderFrames,
      options,
    });
    return await ObjectLayerEngine.publishItemDefinition({
      models,
      payload: ObjectLayerEngine.payloadOf(objectLayer),
      renderFrames,
      rendered,
      options,
    });
  };

  /**
   * DELETE `/object-layer/:id`: removes this host's atlas of a definition. The definition keeps
   * naming its render: the render is content.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../../api/types.js').RouterOptions} options - Router options.
   * @returns {Promise<{success:boolean}>}
   */
  static deleteByObjectLayerId = async (req, res, options) => {
    const models = catalogModels(options);
    const objectLayer = await models.ObjectLayer.findById(req.params.id);
    if (!objectLayer) throw new Error('ObjectLayer not found');
    const atlasDoc = await DataBaseProviderService.getModel('AtlasSpriteSheet', options).findOne({
      objectLayerCid: objectLayer.cid,
    });
    if (!atlasDoc) return { success: true };

    // A published render stays pinned: other hosts serve that content. A draft's render goes
    // with its atlas, unless another definition names it too.
    const { render } = objectLayer.data;
    const releasesRender =
      objectLayer.origin === 'draft' &&
      !!render?.cid &&
      !(await models.ObjectLayer.exists({ 'data.render.cid': render.cid, _id: { $ne: objectLayer._id } }));
    await purgeAtlasDoc({ atlasDoc, options, render: releasesRender ? render : null });
    return { success: true };
  };
}

const AtlasStudioController = {
  generate: serviceHandler(AtlasStudioService.generate, { errorStatus: 500 }),
  deleteByObjectLayerId: serviceHandler(AtlasStudioService.deleteByObjectLayerId, { errorStatus: 500 }),
};

/**
 * The definition an item label runs on: the one the catalog binds it to. The atlas API reads its
 * atlas for every label route: `/blob/:itemKey`, `/metadata/:itemKey`, `/idle-preview/:itemKey`.
 * @param {string} key - Item label.
 * @param {import('../../api/types.js').RouterOptions} options
 * @returns {Promise<string|null>} Canonical Object Layer CID.
 * @memberof CyberiaAtlasStudio
 */
export const resolveKey = async (key, options) =>
  catalogMounted(options) ? await findBoundCid(catalogModels(options), key) : null;

/**
 * Adds the Studio routes to the atlas router.
 * @param {import('express').Router} router
 * @param {import('../../api/types.js').RouterOptions} options
 * @memberof CyberiaAtlasStudio
 */
export function mount(router, options) {
  router.post(`/generate/:id`, options.authMiddleware, moderatorGuard, (req, res) =>
    AtlasStudioController.generate(req, res, options),
  );
  router.delete(`/object-layer/:id`, options.authMiddleware, moderatorGuard, (req, res) =>
    AtlasStudioController.deleteByObjectLayerId(req, res, options),
  );
}
