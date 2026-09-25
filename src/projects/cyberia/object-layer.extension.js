/**
 * Cyberia Object Layer Studio: the authoring routes the Cyberia host adds to the Object Layer API.
 *
 * It builds definitions from the Cyberia asset tree under the Cyberia profile, publishes them
 * through the Object Layer authority and binds their labels in the Cyberia item catalog. It also
 * lets a Cyberia item label name a definition. The host declares it in `conf.server.json` as
 * `apiExtensions: { "object-layer": "cyberia" }`; a host without it serves the canonical API only.
 *
 * @module src/projects/cyberia/object-layer.extension.js
 * @namespace CyberiaObjectLayerStudio
 */
import fs from 'fs-extra';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { moderatorGuard } from '../../server/security/auth.js';
import { serviceHandler } from '../../server/network/middlewares.js';
import { FileFactory } from '../../api/file/file.service.js';
import { ObjectLayerEngine } from './object-layer.js';
import { catalogModels, catalogMounted, findBoundDefinition } from './object-layer-catalog.js';

const logger = loggerFactory(import.meta);

/**
 * Authoring handlers of the Cyberia Studio.
 * @memberof CyberiaObjectLayerStudio
 */
class ObjectLayerStudioService {
  /**
   * POST handler for creating object layers and uploading frame images.
   *
   * Supports three sub-routes:
   * - `/frame-image/:itemType/:itemId/:directionCode` — Upload PNG frame images for a direction.
   * - `/metadata/:itemType/:itemId` — Create an object layer from uploaded frames and metadata.
   * - Default — Create an object layer from the request body, its render frames inline in
   *   `objectLayerRenderFramesData` when it has any.
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
   * @returns {Promise<Object>} The created object layer document or frame upload result.
   * @throws {Error} If file validation fails or required parameters are missing.
   */
  static post = async (req, res, options) => {
    if (req.path.startsWith('/frame-image')) {
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;
      const directionCode = req.params.directionCode;

      // Debug: Log request files structure
      logger.info(`POST Request files for direction ${directionCode}:`, {
        filesKeys: req.files ? Object.keys(req.files) : [],
        filesCount: req.files ? Object.keys(req.files).length : 0,
      });

      // Extract all frames for this direction
      const files = FileFactory.filesExtract(req);

      // Allow empty files to remove all frames from direction
      if (!files || files.length === 0) {
        logger.info(`No files received for direction ${directionCode} - will remove all frames from this direction`);
      } else {
        // Validate each file has data
        for (let i = 0; i < files.length; i++) {
          if (!files[i].data) {
            logger.error(`File ${files[i].name || i} has no data for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} has no data`);
          }
          if (!Buffer.isBuffer(files[i].data)) {
            logger.error(`File ${files[i].name || i} data is not a Buffer for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} data is not a Buffer`);
          }
        }
      }

      logger.info(
        `Processing ${files?.length || 0} file(s) for direction ${directionCode}: ${files?.map((f) => f.name).join(', ') || 'none'}`,
      );

      // Always clear and rewrite ALL frames for this direction code
      for (const basePath of ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`]) {
        const folder = `${basePath}assets/${itemType}/${itemId}/${directionCode}`;

        // Always remove entire direction folder to ensure clean state
        if (fs.existsSync(folder)) {
          await fs.remove(folder);
          logger.info(`Cleared folder: ${folder}`);
        }

        // Only create and write files if we have frames to upload
        if (files && files.length > 0) {
          // Create fresh folder
          fs.mkdirSync(folder, { recursive: true });

          // Write all frames sent in this request
          for (const file of files) {
            const filePath = `${folder}/${file.name}`;
            try {
              fs.writeFileSync(filePath, file.data);
              logger.info(`Wrote file: ${filePath} (${file.data.length} bytes)`);
            } catch (error) {
              logger.error(`Error writing file ${filePath}:`, error);
              throw new Error(`Failed to write ${file.name}: ${error.message}`);
            }
          }
        } else {
          logger.info(`No frames to write for direction ${directionCode} - folder removed`);
        }
      }

      logger.info(`Successfully processed ${files?.length || 0} frame(s) for direction ${directionCode}`);

      return { success: true, directionCode, frameCount: files?.length || 0 };
    }

    if (req.path.startsWith('/metadata')) {
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;
      const folder = `./src/client/public/cyberia/assets/${itemType}/${itemId}`;
      const publicFolder = `./public/${options.host}${options.path}/assets/${itemType}/${itemId}`;

      // Ensure both folders exist
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      if (!fs.existsSync(publicFolder)) fs.mkdirSync(publicFolder, { recursive: true });

      // Write metadata.json to both locations
      const metadataContent = JSON.stringify(req.body);
      fs.writeFileSync(`${folder}/metadata.json`, metadataContent);
      fs.writeFileSync(`${publicFolder}/metadata.json`, metadataContent);

      const { objectLayerRenderFramesData, objectLayerData } =
        await ObjectLayerEngine.buildObjectLayerDataFromDirectory({
          folder,
          objectLayerType: itemType,
          objectLayerId: itemId,
          metadataOverride: req.body,
        });

      return await ObjectLayerEngine.persistObjectLayerDocuments({
        models: catalogModels(options),
        objectLayerRenderFramesData,
        objectLayerData: { ...objectLayerData, createdBy: req.auth.user._id },
        persistOptions: { options },
      });
    }

    // Default route: the body is the definition, with its render frames inline when it has any.
    const { objectLayerRenderFramesData, ...objectLayerData } = { ...req.body, createdBy: req.auth.user._id };
    const models = catalogModels(options);
    if (!objectLayerRenderFramesData)
      return await ObjectLayerEngine.publishItemDefinition({ models, payload: objectLayerData, options });
    return await ObjectLayerEngine.persistObjectLayerDocuments({
      models,
      objectLayerRenderFramesData,
      objectLayerData,
      persistOptions: { options },
    });
  };

  /**
   * PUT handler for updating object layers, their frame images, and metadata.
   *
   * Supports three sub-routes:
   * - `/:id/frame-image/:itemType/:itemId/:directionCode` — Replace frame images for a direction.
   * - `/:id/metadata/:itemType/:itemId` — Update metadata and reprocess all frames.
   * - `/:id` — Publishes the body's content, its render rebuilt from the render frames of `:id`.
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
   * @returns {Promise<Object>} The updated object layer document or frame upload result.
   * @throws {Error} If file validation fails, object layer is not found, or required parameters are missing.
   */
  static put = async (req, res, options) => {
    // PUT /:id/frame-image/:itemType/:itemId/:directionCode - Update frame images for specific direction
    if (req.path.includes('/frame-image/')) {
      const objectLayerId = req.params.id;
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;
      const directionCode = req.params.directionCode;

      // Debug: Log request files structure
      logger.info(`Request files for direction ${directionCode}:`, {
        filesKeys: req.files ? Object.keys(req.files) : [],
        filesCount: req.files ? Object.keys(req.files).length : 0,
      });

      // Extract all frames for this direction
      const files = FileFactory.filesExtract(req);

      // Allow empty files to remove all frames from direction
      if (!files || files.length === 0) {
        logger.info(`No files received for direction ${directionCode} - will remove all frames from this direction`);
      } else {
        // Validate each file has data
        for (let i = 0; i < files.length; i++) {
          if (!files[i].data) {
            logger.error(`File ${files[i].name || i} has no data for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} has no data`);
          }
          if (!Buffer.isBuffer(files[i].data)) {
            logger.error(`File ${files[i].name || i} data is not a Buffer for direction ${directionCode}`);
            throw new Error(`File ${files[i].name || i} data is not a Buffer`);
          }
        }
      }

      logger.info(
        `Processing ${files?.length || 0} file(s) for direction ${directionCode}: ${files?.map((f) => f.name).join(', ') || 'none'}`,
      );

      // Always clear and rewrite ALL frames for this direction code
      for (const basePath of ['./src/client/public/cyberia/', `./public/${options.host}${options.path}`]) {
        const folder = `${basePath}assets/${itemType}/${itemId}/${directionCode}`;

        // Always remove entire direction folder to ensure clean state
        if (fs.existsSync(folder)) {
          await fs.remove(folder);
          logger.info(`Cleared folder: ${folder}`);
        }

        // Only create and write files if we have frames to upload
        if (files && files.length > 0) {
          // Create fresh folder
          fs.mkdirSync(folder, { recursive: true });

          // Write all frames sent in this request
          for (const file of files) {
            const filePath = `${folder}/${file.name}`;
            try {
              fs.writeFileSync(filePath, file.data);
              logger.info(`Wrote file: ${filePath}`);
            } catch (error) {
              logger.error(`Error writing file ${filePath}:`, error);
              throw new Error(`Failed to write ${file.name}: ${error.message}`);
            }
          }
        } else {
          logger.info(`No frames to write for direction ${directionCode} - folder removed`);
        }
      }

      logger.info(
        `Successfully processed ${files?.length || 0} frame(s) for direction ${directionCode} in object layer ${objectLayerId}`,
      );

      return { success: true, directionCode, frameCount: files?.length || 0 };
    }

    // PUT /:id/metadata/:itemType/:itemId - Update object layer metadata and reprocess all frames
    if (req.path.includes('/metadata/')) {
      const itemType = req.params.itemType;
      const itemId = req.params.itemId;

      const folder = `./src/client/public/cyberia/assets/${itemType}/${itemId}`;
      const publicFolder = `./public/${options.host}${options.path}/assets/${itemType}/${itemId}`;

      // Ensure both folders exist
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
      if (!fs.existsSync(publicFolder)) {
        fs.mkdirSync(publicFolder, { recursive: true });
      }

      // Write metadata.json to both locations
      const metadataContent = JSON.stringify(req.body);
      fs.writeFileSync(`${folder}/metadata.json`, metadataContent);
      fs.writeFileSync(`${publicFolder}/metadata.json`, metadataContent);

      const { objectLayerRenderFramesData, objectLayerData } =
        await ObjectLayerEngine.buildObjectLayerDataFromDirectory({
          folder,
          objectLayerType: itemType,
          objectLayerId: itemId,
          metadataOverride: req.body,
        });

      return await ObjectLayerEngine.persistObjectLayerDocuments({
        models: catalogModels(options),
        objectLayerRenderFramesData,
        objectLayerData: { ...objectLayerData, createdBy: req.auth.user._id },
        persistOptions: { options },
      });
    }

    // PUT /:id - publishes the body's content as the definition of the item, with the render
    // rebuilt from the render frames of the given definition
    const models = catalogModels(options);
    const existingOL = await models.ObjectLayer.findById(req.params.id);
    if (!existingOL) throw new Error('ObjectLayer not found');

    const objectLayerData = { ...req.body, createdBy: req.auth.user._id };
    objectLayerData.data ??= ObjectLayerEngine.payloadOf(existingOL).data;
    const objectLayerRenderFramesData = await DataBaseProviderService.getModel('ObjectLayerRenderFrames', options)
      .findOne({ objectLayerCid: existingOL.cid })
      .lean();
    if (!objectLayerRenderFramesData)
      return await ObjectLayerEngine.publishItemDefinition({ models, payload: objectLayerData, options });
    return await ObjectLayerEngine.persistObjectLayerDocuments({
      models,
      objectLayerRenderFramesData,
      objectLayerData,
      persistOptions: { options },
    });
  };
}

const ObjectLayerStudioController = {
  post: serviceHandler(ObjectLayerStudioService.post),
  put: serviceHandler(ObjectLayerStudioService.put),
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
 * Removes what the Studio keeps for a definition that is deleted: the labels bound to it and,
 * when no other definition carries the label, its frames in the asset tree.
 * @param {Object} objectLayer - The definition being deleted.
 * @param {import('../../api/types.js').RouterOptions} options
 * @param {Object} [scope]
 * @param {boolean} [scope.assets=true] - False keeps the asset tree, the source a re-import reads.
 * @returns {Promise<void>}
 * @memberof CyberiaObjectLayerStudio
 */
export const beforeDelete = async (objectLayer, options, { assets = true } = {}) => {
  const { ObjectLayer, CyberiaItemCatalog } = catalogModels(options);
  await CyberiaItemCatalog.deleteMany({ objectLayerCid: objectLayer.cid });
  const itemType = objectLayer.data?.item?.type;
  const itemId = objectLayer.data?.item?.id;
  if (!assets || !itemType || !itemId) return;
  if (await ObjectLayer.exists({ 'data.item.id': itemId, _id: { $ne: objectLayer._id } })) return;
  for (const assetDir of [
    `./src/client/public/cyberia/assets/${itemType}/${itemId}`,
    `./public/${options.host}${options.path}/assets/${itemType}/${itemId}`,
  ]) {
    if (fs.existsSync(assetDir)) await fs.remove(assetDir);
  }
};

/**
 * Adds the Studio routes to the Object Layer router.
 * @param {import('express').Router} router
 * @param {import('../../api/types.js').RouterOptions} options
 * @memberof CyberiaObjectLayerStudio
 */
export function mount(router, options) {
  router.post(
    `/frame-image/:itemType/:itemId/:directionCode`,
    options.authMiddleware,
    moderatorGuard,
    async (req, res) => {
      /*
          #swagger.auto = false
          #swagger.tags = ['object-layer']
          #swagger.summary = 'Upload frame image'
          #swagger.description = 'This endpoint uploads a frame image for a specific object layer item by type, item ID, and direction code'
          #swagger.path = '/object-layer/frame-image/{itemType}/{itemId}/{directionCode}'
          #swagger.method = 'post'
          #swagger.consumes = ['application/octet-stream']

          #swagger.parameters['itemType'] = {
              in: 'path',
              description: 'The type of the item (e.g. skin, weapon)',
              required: true,
              type: 'string'
          }

          #swagger.parameters['itemId'] = {
              in: 'path',
              description: 'The item ID',
              required: true,
              type: 'string'
          }

          #swagger.parameters['directionCode'] = {
              in: 'path',
              description: 'The direction code for the frame (e.g. up, down, left, right)',
              required: true,
              type: 'string'
          }

          #swagger.responses[200] = {
            description: 'Frame image uploaded successfully',
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
    },
  );
  router.post(`/metadata/:itemType/:itemId`, options.authMiddleware, moderatorGuard, async (req, res) => {
    /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Create object layer metadata'
        #swagger.description = 'This endpoint creates metadata for a specific object layer item by type and item ID'
        #swagger.path = '/object-layer/metadata/{itemType}/{itemId}'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.consumes = ['application/json']

        #swagger.parameters['itemType'] = {
            in: 'path',
            description: 'The type of the item',
            required: true,
            type: 'string'
        }

        #swagger.parameters['itemId'] = {
            in: 'path',
            description: 'The item ID',
            required: true,
            type: 'string'
        }

        #swagger.responses[200] = {
          description: 'Metadata created successfully',
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
  router.put(
    `/:id/frame-image/:itemType/:itemId/:directionCode`,
    options.authMiddleware,
    moderatorGuard,
    async (req, res) => {
      /*
          #swagger.auto = false
          #swagger.tags = ['object-layer']
          #swagger.summary = 'Update frame image'
          #swagger.description = 'This endpoint updates a frame image for a specific object layer item by ID, type, item ID, and direction code'
          #swagger.path = '/object-layer/{id}/frame-image/{itemType}/{itemId}/{directionCode}'
          #swagger.method = 'put'
          #swagger.consumes = ['application/octet-stream']
          #swagger.security = [{
            'bearerAuth': []
          }]

          #swagger.parameters['id'] = {
              in: 'path',
              description: 'Object layer ID',
              required: true,
              type: 'string'
          }

          #swagger.parameters['itemType'] = {
              in: 'path',
              description: 'The type of the item',
              required: true,
              type: 'string'
          }

          #swagger.parameters['itemId'] = {
              in: 'path',
              description: 'The item ID',
              required: true,
              type: 'string'
          }

          #swagger.parameters['directionCode'] = {
              in: 'path',
              description: 'The direction code for the frame',
              required: true,
              type: 'string'
          }

          #swagger.responses[200] = {
            description: 'Frame image updated successfully',
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
    },
  );
  router.put(`/:id/metadata/:itemType/:itemId`, options.authMiddleware, moderatorGuard, async (req, res) => {
    /*
          #swagger.auto = false
          #swagger.tags = ['object-layer']
          #swagger.summary = 'Update object layer metadata'
          #swagger.description = 'This endpoint updates metadata for a specific object layer item by ID, type, and item ID'
          #swagger.path = '/object-layer/{id}/metadata/{itemType}/{itemId}'
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

          #swagger.parameters['itemType'] = {
              in: 'path',
              description: 'The type of the item',
              required: true,
              type: 'string'
          }

          #swagger.parameters['itemId'] = {
              in: 'path',
              description: 'The item ID',
              required: true,
              type: 'string'
          }

          #swagger.responses[200] = {
            description: 'Metadata updated successfully',
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
