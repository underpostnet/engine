import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { UserController } from './user.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const UserRouter = (options) => {
  const router = express.Router();
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
    #swagger.summary = 'Log In',
    #swagger.description = 'This endpoint get a JWT for authenticated user.',
    #swagger.path = '/user/auth'
    #swagger.method = 'post'
    #swagger.produces = ['application/json']
    #swagger.consumes = ['application/json']

    #swagger.requestBody = {
      in: 'body',
      description: 'User data.',
      required: true,
      content: {
          "application/json": {
              schema: {
                  $ref: "#/components/schemas/userLogInRequest"
              }  
          }
      }
    }
    
    #swagger.responses[200] = {
      description: "User created successfully.",
      content: {
          "application/json": {
              schema: {
                $ref: "#/components/schemas/userResponse"
              }
          }           
      }
    }   

    #swagger.responses[400] = {
      description: "Bad request. Please check the input data.",
      content: {
          "application/json": {
              schema: {
                $ref: "#/components/schemas/userBadRequestResponse"
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
      #swagger.summary = 'Create user',
      #swagger.description = 'This endpoint will create a new user account.',
      #swagger.path = '/user'
      #swagger.method = 'post'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']

      #swagger.requestBody = {
        in: 'body',
        description: 'User data.',
        required: true,
        content: {
            "application/json": {
                schema: {
                    $ref: "#/components/schemas/userRequest"
                }  
            }
        }
      }
      
      #swagger.responses[200] = {
        description: "User created successfully.",
        content: {
            "application/json": {
                schema: {
                  $ref: "#/components/schemas/userResponse"
                }
            }           
        }
      }   

      #swagger.responses[400] = {
        description: "Bad request. Please check the input data.",
        content: {
            "application/json": {
                schema: {
                  $ref: "#/components/schemas/userBadRequestResponse"
                }
            }           
        }
      } 
    */
    return await UserController.post(req, res, options);
  });

  router.get(`/:id`, authMiddleware, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['user']
      #swagger.summary = 'Get user data by Id',
      #swagger.description = 'This endpoint get user data by Id',
      #swagger.path = '/user/{id}'
      #swagger.method = 'get'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']
      #swagger.security = [{
        "bearerAuth": []
      }] 

      #swagger.parameters['id'] = {
          in: 'path',
          description: 'User ID.',
          required: true,
          type: 'string'
      }

      #swagger.responses[200] = {
        description: "get user successfully.",
        content: {
            "application/json": {
                schema: {
                  $ref: "#/components/schemas/userGetResponse"
                }
            }           
        }
      }   

      #swagger.responses[400] = {
        description: "Bad request. Please check the input data.",
        content: {
            "application/json": {
                schema: {
                  $ref: "#/components/schemas/userBadRequestResponse"
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
      #swagger.summary = 'Update user data by Id',
      #swagger.description = 'This endpoint will update user data by Id',
      #swagger.path = '/user/{id}'
      #swagger.method = 'put'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']
      #swagger.security = [{
        "bearerAuth": []
      }] 
      
      #swagger.parameters['id'] = {
          in: 'path',
          description: 'User ID.',
          required: true,
          type: 'string'
      }

      #swagger.requestBody = {
        in: 'body',
        description: 'User data.',
        required: true,
        content: {
            "application/json": {
                schema: {
                  $ref: "#/components/schemas/userRequest"
                }  
            }
        }
      }

      #swagger.responses[200] = {
        description: "User updated successfully.",
        content: {
            "application/json": {
                schema: {
                  $ref: "#/components/schemas/userUpdateResponse"
                }
            }           
        }
      }   

      #swagger.responses[400] = {
        description: "Bad request. Please check the input data.",
        content: {
            "application/json": {
                schema: {
                  $ref: "#/components/schemas/userBadRequestResponse"
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

  // router.delete(`/:id`, async (req, res) => await UserController.delete(req, res, options));

  return router;
};

const ApiRouter = UserRouter;

export { ApiRouter, UserRouter };
