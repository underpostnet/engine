/**
 * Cyberia Object Layer Studio: the authoring routes the Cyberia host adds to the Object Layer API.
 *
 * It builds definitions from the editor's render source under the Cyberia profile and publishes
 * them through the Object Layer authority. A save never binds: the item runs a definition only
 * once a moderator binds it in the Cyberia item catalog. MongoDB holds every frame; the asset tree changes only through `cyberia ol --client-public`. It also
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
import { ObjectLayerEngine } from './object-layer/object-layer.js';
import {
  catalogModels,
  catalogMounted,
  findBoundDefinition,
  publishItemDefinition,
} from './catalog/object-layer-catalog.js';
import { findObjectLayerByKey } from '../../api/object-layer/object-layer.service.js';
import { contentArtifact } from './content/content-artifact.js';
import { itemContext } from './content/foundation-context.js';
import { loadSagaAssociations, withSagaFilter } from './saga/saga-associations.js';
import {
  framesByDirection,
  fromWire,
  sourceFromDirectionFrames,
  toWire,
} from '../../client/components/objectlayer-studio/RenderSource.js';
import { transformImportedFrames } from './procedural/core/frame-mutation.js';
import { importRoles } from './procedural/spec.js';
import {
  authoringOf,
  customStatBounds,
  statBoundsForType,
  statProblemText,
  statProblems,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { proceduralModels } from './procedural/engine.js';
import { saveRevision } from './procedural/jobs/review.js';
import { populationModels } from './procedural/population/map-context.js';
import { authorTarget } from './procedural/population/results.js';

/**
 * Refuses an authored save whose stats leave its bounds, and names each one: the custom bounds the
 * save declares, checked against the stat contract, else the bounds of its item type.
 * @param {Object} [data] - The data of the save.
 * @param {Object<string,[number,number]>} [statBounds] - The custom bounds of the save.
 * @memberof CyberiaObjectLayerStudio
 */
const checkStats = (data, statBounds) => {
  if (!data) return;
  const refuse = (message) => {
    throw Object.assign(new Error(message), { status: 400, expected: true });
  };
  let bounds = statBoundsForType(data.item?.type);
  if (statBounds)
    try {
      bounds = customStatBounds(statBounds);
    } catch (error) {
      refuse(`Custom stat bounds: ${error.message}`);
    }
  const problems = statProblems(bounds, data.stats);
  if (problems.length > 0)
    refuse(
      `Stats outside the ${statBounds ? 'custom' : data.item?.type} bounds: ${problems.map(statProblemText).join('; ')}`,
    );
};

/**
 * Stores a save the Studio sends with a review key, and publishes nothing: a job item id stores a
 * revision of that Procedural Engine candidate; an authoring key stores the draft definition of that
 * Map Population item.
 * @memberof CyberiaObjectLayerStudio
 */
const reviewedSave = async ({ review, data, statBounds, objectLayerRenderFramesData, req, options }) => {
  checkStats(data, statBounds);
  const actor = String(req.auth.user._id);
  const body = { data, objectLayerRenderFramesData };
  const authoring = authoringOf(review);
  if (authoring)
    return await authorTarget({
      models: populationModels(options),
      id: authoring.populationId,
      itemId: authoring.itemId,
      body,
      actor,
      options,
    });
  return await saveRevision({ models: proceduralModels(options), id: review, body, actor, options });
};

/**
 * Authoring handlers of the Cyberia Studio.
 * @memberof CyberiaObjectLayerStudio
 */
class ObjectLayerStudioService {
  /**
   * POST handler: creates an object layer from the request body, its render source inline in
   * `objectLayerRenderFramesData` when it has one. A body with `review` stores the save as
   * {@link reviewedSave} does instead.
   *
   * A write with render frames delegates to {@link ObjectLayerEngine.persistObjectLayerDocuments}
   * for the render build and the materializations; publication goes through the Object Layer
   * authority. The item keeps its binding.
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
    const { review, statBounds, objectLayerRenderFramesData, ...objectLayerData } = {
      ...req.body,
      createdBy: req.auth.user._id,
    };
    if (review)
      return await reviewedSave({
        review,
        data: objectLayerData.data,
        statBounds,
        objectLayerRenderFramesData,
        req,
        options,
      });
    checkStats(objectLayerData.data, statBounds);
    const models = catalogModels(options);
    if (!objectLayerRenderFramesData) return await publishItemDefinition({ models, payload: objectLayerData, options });
    return await ObjectLayerEngine.persistObjectLayerDocuments({
      models,
      objectLayerRenderFramesData: fromWire(objectLayerRenderFramesData),
      objectLayerData,
      persistOptions: { options },
    });
  };

  /**
   * PUT `/:id`: publishes the body's content as a new definition of the item; the item keeps its
   * binding. Its render source comes inline in `objectLayerRenderFramesData` when the editor sends
   * one, else from the render frames of `:id`. A body with `review` stores the save as
   * {@link reviewedSave} does instead: nothing is published.
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
   * @throws {Error} When `:id` names no definition.
   */
  static put = async (req, res, options) => {
    const models = catalogModels(options);
    const existingOL = await models.ObjectLayer.findById(req.params.id);
    if (!existingOL) throw new Error('ObjectLayer not found');

    const { review, statBounds, objectLayerRenderFramesData, ...body } = req.body;
    if (review)
      return await reviewedSave({ review, data: body.data, statBounds, objectLayerRenderFramesData, req, options });
    checkStats(body.data, statBounds);
    const objectLayerData = { ...body, createdBy: req.auth.user._id };
    objectLayerData.data ??= ObjectLayerEngine.payloadOf(existingOL).data;
    if (objectLayerRenderFramesData)
      return await ObjectLayerEngine.persistObjectLayerDocuments({
        models,
        objectLayerRenderFramesData: fromWire(objectLayerRenderFramesData),
        objectLayerData,
        persistOptions: { options },
      });
    const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
    const stored = await ObjectLayerRenderFrames.findOne({ objectLayerCid: existingOL.cid }).lean();
    if (!stored) return await publishItemDefinition({ models, payload: objectLayerData, options });
    return await ObjectLayerEngine.persistObjectLayerDocuments({
      models,
      objectLayerRenderFramesData: ObjectLayerRenderFrames.sourceOf(stored),
      objectLayerData,
      persistOptions: { options },
    });
  };
}

/**
 * POST `/import-frames`: the frames of the definition a key names, as stored or, with `mutate`, in
 * the palette of the import ({@link importRoles} of the item `target`) and with a seeded contour
 * mutation. Nothing is stored: the source stays as it is, and the editor takes the frames and saves
 * them as it saves any frames.
 * @memberof CyberiaObjectLayerStudio
 */
const importFrames = async (req, res, options) => {
  const { id, palette = {}, mutate = false, mutationFactor = 0, seed = 0, target = '' } = req.body;
  const roles = mutate ? importRoles({ itemId: target, paletteId: palette.paletteId, slots: palette.slots }) : null;
  const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
  const objectLayer = await findObjectLayerByKey({ ObjectLayer, key: id, options, select: { cid: 1 } });
  if (!objectLayer) throw Object.assign(new Error(`No definition for ${id}`), { status: 404 });
  const ObjectLayerRenderFrames = DataBaseProviderService.getModel('ObjectLayerRenderFrames', options);
  const stored = await ObjectLayerRenderFrames.findOne({ objectLayerCid: objectLayer.cid }).lean();
  if (!stored) throw Object.assign(new Error(`"${id}" has no frames to import`), { status: 404 });
  const source = ObjectLayerRenderFrames.sourceOf(stored);
  const { framesByCode, ...metrics } = transformImportedFrames(framesByDirection(source), roles, {
    mutate,
    mutationFactor,
    seed,
    source: id,
    target,
  });
  return {
    ...metrics,
    frameDurationMs: source.frameDurationMs,
    renderFrames: toWire(sourceFromDirectionFrames({ framesByCode, frameDurationMs: source.frameDurationMs })),
  };
};

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
  importFrames: serviceHandler(importFrames),
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
  router.post(`/import-frames`, options.authMiddleware, moderatorGuard, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['object-layer']
      #swagger.summary = 'Frames of a definition in a palette'
      #swagger.description = 'Body { id, palette, mutate, mutationFactor, seed, target }. Answers the frames of the definition `id` names, as stored or, with `mutate`, remapped to the palette of the item `target` and with a seeded contour mutation. `palette` is { paletteId?, slots? }: a palette of the library, else the foundation palettes of `target`, else the first palette of the library, under the slot colors set. Stores nothing.'
      #swagger.path = '/object-layer/import-frames'
      #swagger.method = 'post'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']
      #swagger.security = [{
        'bearerAuth': []
      }]
    */
    return await ObjectLayerStudioController.importFrames(req, res, options);
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
