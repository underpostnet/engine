/**
 * Cyberia Object Layer Studio: the authoring routes the Cyberia host adds to the Object Layer API.
 *
 * It builds definitions from the editor's render source under the Cyberia profile, publishes them
 * through the Object Layer authority and binds their labels in the Cyberia item catalog. MongoDB
 * holds every frame; the asset tree changes only through `cyberia ol --client-public`. It also
 * lets a Cyberia item label name a definition. The host declares it in `conf.server.json` as
 * `apiExtensions: { "object-layer": "cyberia" }`; a host without it serves the canonical API only.
 *
 * @module src/projects/cyberia/object-layer.extension.js
 * @namespace CyberiaObjectLayerStudio
 */
import fs from 'fs-extra';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { serviceHandler } from '../../server/network/middlewares.js';
import { ObjectLayerEngine } from './object-layer.js';
import { catalogModels, catalogMounted, findBoundDefinition } from './object-layer-catalog.js';
import { findObjectLayerByKey } from '../../api/object-layer/object-layer.service.js';
import { contentArtifact } from './content-artifact.js';
import { itemContext } from './foundation-context.js';
import { loadSagaAssociations, withSagaFilter } from './saga-associations.js';
import { fromWire } from '../../client/components/objectlayer-studio/RenderSource.js';

/**
 * Refuses a write made from a definition the label no longer runs: another save came first.
 * @param {import('./object-layer-catalog.js').CatalogModels} models
 * @param {string} loadedId - Document id of the definition the editor loaded.
 * @param {string} itemId - The label the write is for.
 * @throws {Error} 409 when the label binds another definition than the loaded one.
 * @memberof CyberiaObjectLayerStudio
 */
async function assertCurrentDefinition(models, loadedId, itemId) {
  const loaded = await models.ObjectLayer.findById(loadedId, { cid: 1, 'data.item.id': 1 }).lean();
  if (loaded?.data?.item?.id !== itemId) return;
  const bound = await findBoundDefinition(models, itemId);
  if (bound && bound.cid !== loaded.cid)
    throw Object.assign(
      new Error(`'${itemId}' now runs definition ${bound.cid}, not the ${loaded.cid} you edited: reload before saving`),
      { status: 409 },
    );
}

/**
 * Authoring handlers of the Cyberia Studio.
 * @memberof CyberiaObjectLayerStudio
 */
class ObjectLayerStudioService {
  /**
   * POST handler: creates an object layer from the request body, its render source inline in
   * `objectLayerRenderFramesData` when it has one.
   *
   * A write with render frames delegates to {@link ObjectLayerEngine.persistObjectLayerDocuments}
   * for the render build and the materializations; publication goes through the Object Layer
   * authority and the label binds after it.
   *
   * @async
   * @function post
   * @memberof CyberiaObjectLayerStudio.ObjectLayerStudioService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Server options containing host and path.
   * @param {string} options.host - The deployment host.
   * @param {string} options.path - The deployment path.
   * @returns {Promise<Object>} The created object layer document.
   */
  static post = async (req, res, options) => {
    const { objectLayerRenderFramesData, ...objectLayerData } = { ...req.body, createdBy: req.auth.user._id };
    const models = catalogModels(options);
    if (!objectLayerRenderFramesData)
      return await ObjectLayerEngine.publishItemDefinition({ models, payload: objectLayerData, options });
    return await ObjectLayerEngine.persistObjectLayerDocuments({
      models,
      objectLayerRenderFramesData: fromWire(objectLayerRenderFramesData),
      objectLayerData,
      persistOptions: { options },
    });
  };

  /**
   * PUT `/:id`: publishes the body's content as the definition of the item. Its render source comes
   * inline in `objectLayerRenderFramesData` when the editor sends one, else from the render frames
   * of `:id`. A save made from a definition another save replaced answers 409.
   *
   * A write with render frames delegates to {@link ObjectLayerEngine.persistObjectLayerDocuments}
   * for the render build, the identity, the IPFS pins and the materializations.
   *
   * @async
   * @function put
   * @memberof CyberiaObjectLayerStudio.ObjectLayerStudioService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} options - Server options containing host and path.
   * @param {string} options.host - The deployment host.
   * @param {string} options.path - The deployment path.
   * @returns {Promise<Object>} The published object layer document.
   * @throws {Error} 404 when `:id` names no definition; 409 when the label runs another one.
   */
  static put = async (req, res, options) => {
    const models = catalogModels(options);
    const existingOL = await models.ObjectLayer.findById(req.params.id);
    if (!existingOL) throw new Error('ObjectLayer not found');

    const { objectLayerRenderFramesData, ...body } = req.body;
    const objectLayerData = { ...body, createdBy: req.auth.user._id };
    objectLayerData.data ??= ObjectLayerEngine.payloadOf(existingOL).data;
    await assertCurrentDefinition(models, req.params.id, objectLayerData.data.item?.id);
    if (objectLayerRenderFramesData)
      return await ObjectLayerEngine.persistObjectLayerDocuments({
        models,
        objectLayerRenderFramesData: fromWire(objectLayerRenderFramesData),
        objectLayerData,
        persistOptions: { options },
      });
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
    const stored = await ObjectLayerRenderFrames.findOne({ objectLayerCid: existingOL.cid }).lean();
    if (!stored) return await ObjectLayerEngine.publishItemDefinition({ models, payload: objectLayerData, options });
    return await ObjectLayerEngine.persistObjectLayerDocuments({
      models,
      objectLayerRenderFramesData: ObjectLayerRenderFrames.sourceOf(stored),
      objectLayerData,
      persistOptions: { options },
    });
  };
}

/**
 * GET `/context/:id`: the foundation context of the item a key names. The key is a cid, a document
 * id or an item label, so an item the foundation defines has its context before anyone paints it.
 * Read-only.
 * @memberof CyberiaObjectLayerStudio
 */
const context = async (req, res, options) => {
  const key = req.params.id;
  const objectLayer = await findObjectLayerByKey({
    ObjectLayer: DataBaseProviderService.getModel('ObjectLayer', options),
    key,
    options,
    select: { 'data.item.id': 1 },
  });
  const itemId = objectLayer?.data?.item?.id ?? key;
  const found = itemContext(itemId, contentArtifact().context);
  if (!found) throw Object.assign(new Error(`No foundation definition labels ${itemId}`), { status: 404 });
  return { ...found, sagas: (await loadSagaAssociations(options)).items[itemId] ?? [] };
};

const ObjectLayerStudioController = {
  post: serviceHandler(ObjectLayerStudioService.post),
  put: serviceHandler(ObjectLayerStudioService.put),
  context: serviceHandler(context, { crossOrigin: true }),
};

/**
 * The document id a Cyberia item label names: the definition the catalog binds it to.
 * @param {string} key
 * @param {import('../../api/types.js').RouterOptions} options
 * @returns {Promise<Object|null>}
 * @memberof CyberiaObjectLayerStudio
 */
export const resolveKey = async (key, options) =>
  catalogMounted(options) ? ((await findBoundDefinition(catalogModels(options), key))?._id ?? null) : null;

/**
 * The list parameters of an Object Layer table with its saga filter moved onto the item labels of
 * the sagas it names.
 * @param {Object} params - Request query.
 * @param {import('../../api/types.js').RouterOptions} options
 * @returns {Promise<Object>}
 * @memberof CyberiaObjectLayerStudio
 */
export const listParams = (params, options) =>
  withSagaFilter(params, { family: 'items', field: 'data.item.id' }, options);

/**
 * Removes what the Studio keeps for a definition that is deleted: the labels bound to it and, with
 * `assets` (`cyberia ol --drop --client-public`), its frames in the asset tree when no other
 * definition carries the label.
 * @param {Object} objectLayer - The definition being deleted.
 * @param {import('../../api/types.js').RouterOptions} options
 * @param {Object} [scope]
 * @param {boolean} [scope.assets=false] - Also remove the item's folder from the asset tree.
 * @returns {Promise<void>}
 * @memberof CyberiaObjectLayerStudio
 */
export const beforeDelete = async (objectLayer, options, { assets = false } = {}) => {
  const { ObjectLayer, CyberiaItemCatalog } = catalogModels(options);
  await CyberiaItemCatalog.deleteMany({ objectLayerCid: objectLayer.cid });
  const itemType = objectLayer.data?.item?.type;
  const itemId = objectLayer.data?.item?.id;
  if (!assets || !itemType || !itemId) return;
  if (await ObjectLayer.exists({ 'data.item.id': itemId, _id: { $ne: objectLayer._id } })) return;
  for (const basePath of ObjectLayerEngine.clientPublicPaths(options))
    await fs.remove(`${basePath}/assets/${itemType}/${itemId}`);
};

/**
 * Adds the Studio routes to the Object Layer router.
 * @param {import('express').Router} router
 * @param {import('../../api/types.js').RouterOptions} options
 * @memberof CyberiaObjectLayerStudio
 */
export function mount(router, options) {
  router.get(`/context/:id`, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['object-layer']
      #swagger.summary = 'Foundation context of an item'
      #swagger.description = 'The Cyberia foundation context of the item a cid, document id or item label names: its definition, art brief, palettes, world, the maps that place it and every reference in both directions. Read-only.'
      #swagger.path = '/object-layer/context/{id}'
      #swagger.method = 'get'
      #swagger.produces = ['application/json']
      #swagger.parameters['id'] = { in: 'path', description: 'cid, document id or item label', required: true, type: 'string' }
    */
    return await ObjectLayerStudioController.context(req, res, options);
  });
  router.post(`/:id`, options.authMiddleware, moderatorGuard, async (req, res) => {
    /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Create object layer by ID'
        #swagger.description = 'This endpoint creates a new object layer entry with a specific ID'
        #swagger.path = '/object-layer/{id}'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.consumes = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]

        #swagger.parameters['id'] = {
            in: 'path',
            description: 'Object layer ID',
            required: true,
            type: 'string'
        }

        #swagger.responses[200] = {
          description: 'Object layer created successfully',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/objectLayerResponse'
                  }
              }
          }
        }

        #swagger.responses[400] = {
          description: 'Bad request. Please check the input data',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/objectLayerBadRequestResponse'
                  }
              }
          }
        }
      */
    return await ObjectLayerStudioController.post(req, res, options);
  });
  router.post(`/`, options.authMiddleware, moderatorGuard, async (req, res) => {
    /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Create object layer'
        #swagger.description = 'This endpoint creates a new object layer entry'
        #swagger.path = '/object-layer'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.consumes = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]

        #swagger.responses[200] = {
          description: 'Object layer created successfully',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/objectLayerResponse'
                  }
              }
          }
        }

        #swagger.responses[400] = {
          description: 'Bad request. Please check the input data',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/objectLayerBadRequestResponse'
                  }
              }
          }
        }
      */
    return await ObjectLayerStudioController.post(req, res, options);
  });
  router.put(`/:id`, options.authMiddleware, moderatorGuard, async (req, res) => {
    /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Update object layer by ID'
        #swagger.description = 'This endpoint updates an object layer entry by ID'
        #swagger.path = '/object-layer/{id}'
        #swagger.method = 'put'
        #swagger.produces = ['application/json']
        #swagger.consumes = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]

        #swagger.parameters['id'] = {
            in: 'path',
            description: 'Object layer ID',
            required: true,
            type: 'string'
        }

        #swagger.responses[200] = {
          description: 'Object layer updated successfully',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/objectLayerResponse'
                  }
              }
          }
        }

        #swagger.responses[400] = {
          description: 'Bad request. Please check the input data',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/objectLayerBadRequestResponse'
                  }
              }
          }
        }
      */
    return await ObjectLayerStudioController.put(req, res, options);
  });
  router.put(`/`, options.authMiddleware, moderatorGuard, async (req, res) => {
    /*
        #swagger.ignore = true
      */
    return await ObjectLayerStudioController.put(req, res, options);
  });
}
