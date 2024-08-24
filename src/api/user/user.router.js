import { authMiddleware } from '../../server/auth.js';
import { faBase64Png, getBufferPngText } from '../../server/client-icons.js';
import { loggerFactory } from '../../server/logger.js';
import { UserController } from './user.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const UserRouter = (options) => {
  const router = express.Router();

  (async () => {
    options.png = {
      buffer: {
        'invalid-token': await getBufferPngText({ text: 'Invalid token', textColor: '#ff0000' }),
        recover: Buffer.from(faBase64Png('rotate-left', 50, 50, '#ffffff'), 'base64'),
        check: Buffer.from(faBase64Png('check', 50, 50), 'base64'),
      },
      header: (res) => {
        res.set('Content-Type', 'image/png');
      },
    };
  })();

  router.post(`/mailer/:id`, authMiddleware, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.post(req, res, options);
  });

  router.get(`/mailer/:id`, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.get(req, res, options);
  });

  router.get(`/email/:email`, authMiddleware, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.get(req, res, options);
  });

  router.post(`/:id`, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.post(req, res, options);
  });

  // #swagger.start

  /*
    #swagger.auto = false
    #swagger.tags = ['user']
    #swagger.summary = 'Log in'
    #swagger.description = 'This endpoint get a JWT for authenticated user'
    #swagger.path = '/user/auth'
    #swagger.method = 'post'
    #swagger.produces = ['application/json']
    #swagger.consumes = ['application/json']

    #swagger.requestBody = {
      in: 'body',
      description: 'User data',
      required: true,
      content: {
          'application/json': {
              schema: {
                  $ref: '#/components/schemas/userLogInRequest'
              }  
          }
      }
    }
    
    #swagger.responses[200] = {
      description: 'User created successfully',
      content: {
          'application/json': {
              schema: {
                $ref: '#/components/schemas/userResponse'
              }
          }           
      }
    }   

    #swagger.responses[400] = {
      description: 'Bad request. Please check the input data',
      content: {
          'application/json': {
              schema: {
                $ref: '#/components/schemas/userBadRequestResponse'
              }
          }           
      }
    } 
  */

  // #swagger.end

  router.post(`/`, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['user']
      #swagger.summary = 'Create user'
      #swagger.description = 'This endpoint will create a new user account'
      #swagger.path = '/user'
      #swagger.method = 'post'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']

      #swagger.requestBody = {
        in: 'body',
        description: 'User data',
        required: true,
        content: {
            'application/json': {
                schema: {
                    $ref: '#/components/schemas/userRequest'
                }  
            }
        }
      }
      
      #swagger.responses[200] = {
        description: 'User created successfully',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userResponse'
                }
            }           
        }
      }   

      #swagger.responses[400] = {
        description: 'Bad request. Please check the input data',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userBadRequestResponse'
                }
            }           
        }
      } 
    */
    return await UserController.post(req, res, options);
  });

  router.get(`/recover/:id`, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.get(req, res, options);
  });

  router.get(`/:id`, authMiddleware, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['user']
      #swagger.summary = 'Get user data by ID'
      #swagger.description = 'This endpoint get user data by ID'
      #swagger.path = '/user/{id}'
      #swagger.method = 'get'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']
      #swagger.security = [{
        'bearerAuth': []
      }] 

      #swagger.parameters['id'] = {
          in: 'path',
          description: 'User ID',
          required: true,
          type: 'string'
      }

      #swagger.responses[200] = {
        description: 'get user successfully',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userGetResponse'
                }
            }           
        }
      }   

      #swagger.responses[400] = {
        description: 'Bad request. Please check the input data',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userBadRequestResponse'
                }
            }           
        }
      } 
    */
    return await UserController.get(req, res, options);
  });
  router.get(`/`, authMiddleware, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.get(req, res, options);
  });
  router.put(`/recover/:id`, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.put(req, res, options);
  });
  router.put(`/profile-image/:id`, authMiddleware, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.put(req, res, options);
  });
  router.put(`/:id`, authMiddleware, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['user']
      #swagger.summary = 'Update user data by ID'
      #swagger.description = 'This endpoint will update user data by ID'
      #swagger.path = '/user/{id}'
      #swagger.method = 'put'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']
      #swagger.security = [{
        'bearerAuth': []
      }] 
      
      #swagger.parameters['id'] = {
          in: 'path',
          description: 'User ID',
          required: true,
          type: 'string'
      }

      #swagger.requestBody = {
        in: 'body',
        description: 'User data',
        required: true,
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userRequest'
                }  
            }
        }
      }

      #swagger.responses[200] = {
        description: 'User updated successfully',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userUpdateResponse'
                }
            }           
        }
      }   

      #swagger.responses[400] = {
        description: 'Bad request. Please check the input data',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userBadRequestResponse'
                }
            }           
        }
      } 
    */
    return await UserController.put(req, res, options);
  });
  router.put(`/`, authMiddleware, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.put(req, res, options);
  });

  router.delete(`/:id`, authMiddleware, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['user']
      #swagger.summary = 'Delete user data by ID'
      #swagger.description = 'This endpoint deletes user data by ID, the path ID must match with the ID of the authenticated user'
      #swagger.path = '/user/{id}'
      #swagger.method = 'delete'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']
      #swagger.security = [{
        'bearerAuth': []
      }] 

      #swagger.parameters['id'] = {
          in: 'path',
          description: 'User ID',
          required: true,
          type: 'string'
      }

      #swagger.responses[200] = {
        description: 'get user successfully',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userGetResponse'
                }
            }           
        }
      }   

      #swagger.responses[400] = {
        description: 'Bad request. Please check the input data',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userBadRequestResponse'
                }
            }           
        }
      } 
    */
    return await UserController.delete(req, res, options);
  });

  router.delete(`/`, authMiddleware, async (req, res) => {
    /*  
      #swagger.ignore = true
    */
    return await UserController.delete(req, res, options);
  });

  return router;
};

const ApiRouter = UserRouter;

export { ApiRouter, UserRouter };
