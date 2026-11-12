import { loggerFactory } from '../../server/ops/logger.js';
import { ObjectLayerController } from './object-layer.controller.js';
import express from 'express';
import { sendError } from '../../server/network/middlewares.js';
import { parseIdentityJson } from './object-layer.identity.js';

const logger = loggerFactory(import.meta);

/*
  #swagger.components.schemas.objectLayerResponse = {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'success' },
      data: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '66c377f57f99e5969b81de89' },
          data: {
            type: 'object',
            properties: {
              stats: {
                type: 'object',
                properties: {
                  effect: { type: 'number', example: 0 },
                  resistance: { type: 'number', example: 0 },
                  agility: { type: 'number', example: 0 },
                  range: { type: 'number', example: 0 },
                  intelligence: { type: 'number', example: 0 },
                  utility: { type: 'number', example: 0 },
                },
              },
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'skin-default' },
                  type: { type: 'string', example: 'skin' },
                  description: { type: 'string', example: 'Default skin layer' },
                  activable: { type: 'boolean', example: false },
                },
              },
              render: {
                type: 'object',
                properties: {
                  cid: { type: 'string', example: '' },
                  metadataCid: { type: 'string', example: '' },
                },
              },
            },
          },
          schemaVersion: { type: 'number', example: 1 },
          profile: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cyberia' },
              version: { type: 'number', example: 2 },
            },
          },
          cid: { type: 'string', example: 'bafkreigwyjocgnki35vw52b37crc2nvc6cyw3pvvgckthvr5tvrfnk4wda' },
          contentHash: { type: 'string', example: 'd6c25c233548df6b6ee83bf8a22d36a2f0b16dbeb5309533d63d9d6256ab9618' },
        },
      },
    },
  }
  #swagger.components.schemas.objectLayerBadRequestResponse = {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'error' },
      message: { type: 'string', example: 'Bad request. Please check your inputs, and try again' },
    },
  }
*/

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'object-layer',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
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
    router.post(`/canonical`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Publish a canonical definition'
        #swagger.description = 'Stores a canonical Object Layer { schemaVersion, profile, data } under its content identity. Idempotent. Accepts a user session or the cross-domain service key.'
        #swagger.path = '/object-layer/canonical'
        #swagger.method = 'post'
      */
      return await ObjectLayerController.post(req, res, context);
    });
    router.put(`/lifecycle/:id`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Archive a definition, or offer it again'
        #swagger.description = 'Archives the definition, or offers it again. Only the owner of the definition or an admin may do it. A published definition stays stored under its cid.'
        #swagger.path = '/object-layer/lifecycle/{id}'
        #swagger.method = 'put'
        #swagger.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['archived'],
                properties: { archived: { type: 'boolean', description: 'true archives the definition, false offers it again.' } },
              },
              examples: { archive: { summary: 'Archive the definition', value: { archived: true } } },
            },
          },
        }
      */
      return await ObjectLayerController.lifecycle(req, res, context);
    });
    router.delete(`/purge/:id`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Purge a definition from this host'
        #swagger.description = 'Removes every record this host stores of the definition: the document, render frames, atlas, render files, IPFS pin records, pinned content and MFS paths. Only the owner of the definition (the domain that published it) or an admin may do it. Not reversible, refused for a definition ItemLedger registers.'
        #swagger.path = '/object-layer/purge/{id}'
        #swagger.method = 'delete'
        #swagger.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cid'],
                properties: { cid: { type: 'string', description: 'The cid of the definition the path names, as a confirmation.' } },
              },
              examples: { purge: { summary: 'Confirm the cid to purge', value: { cid: '<definition-cid>' } } },
            },
          },
        }
      */
      return await ObjectLayerController.purge(req, res, context);
    });
    // Authoring routes of the host's Studio (`apiExtensions` in conf.server.json).
    context.extension?.mount(router, context);
    router.get(`/render/:id`, async (req, res) => {
      /*
        #swagger.summary = 'Get object layer render data'
        #swagger.description = 'This endpoint retrieves render data for a specific object layer by ID'
        #swagger.path = '/object-layer/render/{id}'
        #swagger.method = 'get'
        #swagger.parameters = [
          { name: 'id', in: 'path', description: 'Object layer ID', required: true, schema: { type: 'string' } },
        ]
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
      return await ObjectLayerController.get(req, res, context);
    });
    router.get(`/metadata/:id`, async (req, res) => {
      /*
        #swagger.summary = 'Get object layer metadata'
        #swagger.description = 'This endpoint retrieves metadata for a specific object layer by ID'
        #swagger.path = '/object-layer/metadata/{id}'
        #swagger.method = 'get'
        #swagger.parameters = [
          { name: 'id', in: 'path', description: 'Object layer ID', required: true, schema: { type: 'string' } },
        ]
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
      return await ObjectLayerController.get(req, res, context);
    });
    router.get(`/search-item-ids`, async (req, res) => {
      /*
        #swagger.summary = 'Resolve object layer item identity'
        #swagger.description = 'Returns { id, type } for partial matches of data.item.id (type-ahead) or for an exact id list'
        #swagger.path = '/object-layer/search-item-ids'
        #swagger.method = 'get'
        #swagger.parameters = [
          { name: 'q', in: 'query', description: 'Partial item ID to search for', required: false, schema: { type: 'string' } },
          { name: 'ids', in: 'query', description: 'Comma separated exact item IDs to resolve', required: false, schema: { type: 'string' } },
        ]
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
      return await ObjectLayerController.get(req, res, context);
    });
    router.get(`/:id`, async (req, res) => {
      /*
        #swagger.summary = 'Get object layer by ID'
        #swagger.description = 'This endpoint retrieves a specific object layer by ID'
        #swagger.path = '/object-layer/{id}'
        #swagger.method = 'get'
        #swagger.parameters = [
          { name: 'id', in: 'path', description: 'Object layer ID', required: true, schema: { type: 'string' } },
        ]
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
      return await ObjectLayerController.get(req, res, context);
    });
    router.get(`/`, async (req, res) => {
      /*
        #swagger.summary = 'Get all object layers'
        #swagger.description = 'This endpoint retrieves all object layers'
        #swagger.path = '/object-layer'
        #swagger.method = 'get'
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
      return await ObjectLayerController.get(req, res, context);
    });
    router.delete(`/:id`, auth.requireModerator, async (req, res) => {
      /*
          #swagger.summary = 'Delete object layer by ID'
          #swagger.description = 'Removes a draft or cache copy by ID: its owner or an admin. A published definition is archived, never deleted'
          #swagger.path = '/object-layer/{id}'
          #swagger.method = 'delete'
          #swagger.parameters = [
            { name: 'id', in: 'path', description: 'Object layer ID', required: true, schema: { type: 'string' } },
          ]
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
      return await ObjectLayerController.delete(req, res, context);
    });
    router.delete(`/`, auth.requireAdmin, async (req, res) => {
      return await ObjectLayerController.delete(req, res, context);
    });
    return router;
  },
};
