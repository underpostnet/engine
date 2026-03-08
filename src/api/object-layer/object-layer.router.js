import { loggerFactory } from '../../server/logger.js';
import { ObjectLayerController } from './object-layer.controller.js';
import express from 'express';
import { adminGuard } from '../../server/auth.js';

const logger = loggerFactory(import.meta);

const ObjectLayerRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/frame-image/:itemType/:itemId/:directionCode`, async (req, res) => {
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
    return await ObjectLayerController.post(req, res, options);
  });
  router.post(`/metadata/:itemType/:itemId`, async (req, res) => {
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
    return await ObjectLayerController.post(req, res, options);
  });

  router.post(`/:id`, authMiddleware, async (req, res) => {
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
    return await ObjectLayerController.post(req, res, options);
  });
  router.post(`/`, authMiddleware, async (req, res) => {
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
    return await ObjectLayerController.post(req, res, options);
  });
  router.get(`/generate-webp/:itemType/:itemId/:directionCode`, async (req, res) => {
    /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Generate WebP image'
        #swagger.description = 'This endpoint generates a WebP image for a specific object layer item by type, item ID, and direction code'
        #swagger.path = '/object-layer/generate-webp/{itemType}/{itemId}/{directionCode}'
        #swagger.method = 'get'
        #swagger.produces = ['image/webp']

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
          description: 'WebP image generated successfully',
          content: {
              'image/webp': {
                  schema: {
                    type: 'string',
                    format: 'binary'
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
    return await ObjectLayerController.generateWebp(req, res, options);
  });
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
  router.get(`/frame-counts/:id`, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['object-layer']
      #swagger.summary = 'Get frame counts'
      #swagger.description = 'This endpoint retrieves frame counts for a specific object layer by ID'
      #swagger.path = '/object-layer/frame-counts/{id}'
      #swagger.method = 'get'
      #swagger.produces = ['application/json']

      #swagger.parameters['id'] = {
          in: 'path',
          description: 'Object layer ID',
          required: true,
          type: 'string'
      }

      #swagger.responses[200] = {
        description: 'Frame counts retrieved successfully',
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
  router.put(`/:id/frame-image/:itemType/:itemId/:directionCode`, authMiddleware, async (req, res) => {
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
    return await ObjectLayerController.put(req, res, options);
  });
  router.put(`/:id/metadata/:itemType/:itemId`, authMiddleware, async (req, res) => {
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
    return await ObjectLayerController.put(req, res, options);
  });
  router.put(`/:id`, authMiddleware, async (req, res) => {
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
    return await ObjectLayerController.put(req, res, options);
  });
  router.put(`/`, authMiddleware, async (req, res) => {
    /*
      #swagger.ignore = true
    */
    return await ObjectLayerController.put(req, res, options);
  });
  router.delete(`/:id`, authMiddleware, adminGuard, async (req, res) => {
    /*
        #swagger.auto = false
        #swagger.tags = ['object-layer']
        #swagger.summary = 'Delete object layer by ID'
        #swagger.description = 'This endpoint deletes an object layer entry by ID. Requires admin privileges'
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
  router.delete(`/`, authMiddleware, adminGuard, async (req, res) => {
    /*
        #swagger.ignore = true
      */
    return await ObjectLayerController.delete(req, res, options);
  });
  return router;
};

const ApiRouter = ObjectLayerRouter;

export { ApiRouter, ObjectLayerRouter };
