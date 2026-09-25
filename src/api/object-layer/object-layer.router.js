import { loggerFactory } from '../../server/ops/logger.js';
import { ObjectLayerController } from './object-layer.controller.js';
import express from 'express';
import { moderatorGuard, adminGuard } from '../../server/security/auth.js';
import { sendError } from '../../server/network/middlewares.js';
import { parseIdentityJson } from './object-layer.identity.js';

const logger = loggerFactory(import.meta);

class ObjectLayerRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    // A body feeds a canonical identity: two equal property names must not collapse into one.
    router.use((req, res, next) => {
      if (!req.rawBody?.length) return next();
      try {
        parseIdentityJson(req.rawBody.toString('utf8'));
      } catch (error) {
        return sendError(res, error);
      }
      return next();
    });
    router.post(`/canonical`, options.authMiddleware, moderatorGuard, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Publish a canonical definition'
        #swagger.description = 'Stores a canonical Object Layer { schemaVersion, profile, data } under its content identity. Idempotent. Accepts a user session or the cross-domain service key.'
        #swagger.path = '/object-layer/canonical'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.consumes = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await ObjectLayerController.post(req, res, options);
    });
    router.put(`/lifecycle/:id`, options.authMiddleware, moderatorGuard, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Archive a definition, or offer it again'
        #swagger.description = 'Body { archived: boolean }. The owner of the definition or an admin. A published definition stays stored under its cid.'
        #swagger.path = '/object-layer/lifecycle/{id}'
        #swagger.method = 'put'
        #swagger.produces = ['application/json']
        #swagger.consumes = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await ObjectLayerController.lifecycle(req, res, options);
    });
    router.delete(`/purge/:id`, options.authMiddleware, adminGuard, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Purge a definition from this host'
        #swagger.description = 'Removes every record this host stores of the definition: the document, render frames, atlas, render files, IPFS pin records, pinned content and MFS paths. Body { cid } names the definition. Admin only, not reversible, refused for a definition ItemLedger registers.'
        #swagger.path = '/object-layer/purge/{id}'
        #swagger.method = 'delete'
        #swagger.produces = ['application/json']
        #swagger.consumes = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await ObjectLayerController.purge(req, res, options);
    });
    // Authoring routes of the host's Studio (`apiExtensions` in conf.server.json).
    options.extension?.mount(router, options);
    router.get(`/render/:id`, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Get object layer render data'
        #swagger.description = 'This endpoint retrieves render data for a specific object layer by ID'
        #swagger.path = '/object-layer/render/{id}'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']

        #swagger.parameters['id'] = {
            in: 'path',
            description: 'Object layer ID',
            required: true,
            type: 'string'
        }

        #swagger.responses[200] = {
          description: 'Object layer render data retrieved successfully',
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
      return await ObjectLayerController.get(req, res, options);
    });
    router.get(`/metadata/:id`, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Get object layer metadata'
        #swagger.description = 'This endpoint retrieves metadata for a specific object layer by ID'
        #swagger.path = '/object-layer/metadata/{id}'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']

        #swagger.parameters['id'] = {
            in: 'path',
            description: 'Object layer ID',
            required: true,
            type: 'string'
        }

        #swagger.responses[200] = {
          description: 'Object layer metadata retrieved successfully',
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
      return await ObjectLayerController.get(req, res, options);
    });
    router.get(`/search-item-ids`, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Resolve object layer item identity'
        #swagger.description = 'Returns { id, type } for partial matches of data.item.id (type-ahead) or for an exact id list'
        #swagger.path = '/object-layer/search-item-ids'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']

        #swagger.parameters['q'] = {
            in: 'query',
            description: 'Partial item ID to search for',
            required: false,
            type: 'string'
        }

        #swagger.parameters['ids'] = {
            in: 'query',
            description: 'Comma separated exact item IDs to resolve',
            required: false,
            type: 'string'
        }

        #swagger.responses[200] = {
          description: 'Item identities matching the query',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/objectLayerResponse'
                  }
              }
          }
        }
      */
      return await ObjectLayerController.get(req, res, options);
    });
    router.get(`/:id`, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Get object layer by ID'
        #swagger.description = 'This endpoint retrieves a specific object layer by ID'
        #swagger.path = '/object-layer/{id}'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']

        #swagger.parameters['id'] = {
            in: 'path',
            description: 'Object layer ID',
            required: true,
            type: 'string'
        }

        #swagger.responses[200] = {
          description: 'Object layer retrieved successfully',
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
      return await ObjectLayerController.get(req, res, options);
    });
    router.get(`/`, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Get all object layers'
        #swagger.description = 'This endpoint retrieves all object layers'
        #swagger.path = '/object-layer'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']

        #swagger.responses[200] = {
          description: 'Object layers retrieved successfully',
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
      return await ObjectLayerController.get(req, res, options);
    });
    router.delete(`/:id`, options.authMiddleware, moderatorGuard, async (req, res) => {
      /*
          #swagger.auto = false
          #swagger.tags = ['object-layer']
          #swagger.summary = 'Delete object layer by ID'
          #swagger.description = 'Removes a draft or cache copy by ID: its owner or an admin. A published definition is archived, never deleted'
          #swagger.path = '/object-layer/{id}'
          #swagger.method = 'delete'
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
            description: 'Object layer deleted successfully',
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
      return await ObjectLayerController.delete(req, res, options);
    });
    router.delete(`/`, options.authMiddleware, adminGuard, async (req, res) => {
      /*
          #swagger.ignore = true
        */
      return await ObjectLayerController.delete(req, res, options);
    });
    return router;
  }
}

const ApiRouter = (options) => ObjectLayerRouter.router(options);

export { ApiRouter, ObjectLayerRouter };
