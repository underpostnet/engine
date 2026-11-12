import express from 'express';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

/*
  #swagger.components.schemas.userRequest = {
    type: 'object',
    required: ['username', 'password', 'email'],
    properties: {
      username: { type: 'string', example: 'user123' },
      password: { type: 'string', example: 'Password123!' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
    },
  }
  #swagger.components.schemas.userLogInRequest = {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      password: { type: 'string', example: 'Password123!' },
    },
  }
  #swagger.components.schemas.user = {
    type: 'object',
    properties: {
      _id: { type: 'string', example: '66c377f57f99e5969b81de89' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      emailConfirmed: { type: 'boolean', example: false },
      username: { type: 'string', example: 'user123' },
      role: { type: 'string', example: 'user' },
      profileImageId: { type: 'string', example: '66c377f57f99e5969b81de87' },
    },
  }
  #swagger.components.schemas.userResponse = {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'success' },
      data: {
        type: 'object',
        properties: {
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          user: { $ref: '#/components/schemas/user' },
        },
      },
    },
  }
  #swagger.components.schemas.userDataResponse = {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'success' },
      data: { $ref: '#/components/schemas/user' },
    },
  }
  #swagger.components.schemas.userBadRequestResponse = {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'error' },
      message: { type: 'string', example: 'Bad request. Please check your inputs, and try again' },
    },
  }
*/

/** The images a mailer link answers, by name. */
const mailerImage = (name) => ({
  file: new URL(`../../client/public/default/assets/mailer/${name}.png`, import.meta.url),
  contentType: 'image/png',
});

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'user',
  services: ['database', 'auth', 'mailer', 'assets'],
  assets: {
    'invalid-token': mailerImage('api-user-invalid-token'),
    recover: mailerImage('api-user-recover'),
    check: mailerImage('api-user-check'),
    avatar: mailerImage('api-user-default-avatar'),
  },
  initialize: (context) => UserService.bootstrap(context),
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();

    router.post(`/mailer/:id`, auth.authenticate, async (req, res) => {
      return await UserController.post(req, res, context);
    });

    router.get(`/assets/:id`, async (req, res) => {
      return await UserController.get(req, res, context);
    });

    router.get(`/mailer/:id`, async (req, res) => {
      return await UserController.get(req, res, context);
    });

    router.get(`/email/:email`, auth.authenticate, async (req, res) => {
      return await UserController.get(req, res, context);
    });

    router.post(`/:id`, async (req, res) => {
      return await UserController.post(req, res, context);
    });

    /*
      #swagger.summary = 'Log in'
      #swagger.description = 'This endpoint get a JWT for authenticated user'
      #swagger.path = '/user/auth'
      #swagger.method = 'post'
      #swagger.requestBody = {
        description: 'User login credentials',
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/userLogInRequest' } } },
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

    router.post(`/`, async (req, res) => {
      /*
        #swagger.summary = 'Create user'
        #swagger.description = 'This endpoint will create a new user account'
        #swagger.path = '/user'
        #swagger.method = 'post'
        #swagger.requestBody = {
          description: 'User registration data',
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/userRequest' } } },
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
      return await UserController.post(req, res, context);
    });

    router.get(`/recover/:id`, async (req, res) => {
      return await UserController.get(req, res, context);
    });

    router.get(`/username/:username`, async (req, res) => {
      return await UserController.get(req, res, context);
    });

    router.get(`/:id`, auth.authenticate, async (req, res) => {
      /*
        #swagger.summary = 'Get user data by ID'
        #swagger.description = 'This endpoint get user data by ID'
        #swagger.path = '/user/{id}'
        #swagger.method = 'get'
        #swagger.parameters = [
          { name: 'id', in: 'path', description: 'User ID', required: true, schema: { type: 'string' } },
        ]
        #swagger.responses[200] = {
          description: 'get user successfully',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/userDataResponse'
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
      return await UserController.get(req, res, context);
    });

    router.get(`/`, auth.authenticate, async (req, res) => {
      return await UserController.get(req, res, context);
    });

    router.put(`/recover/:id`, async (req, res) => {
      return await UserController.put(req, res, context);
    });

    router.put(`/profile-image/:id`, auth.authenticate, async (req, res) => {
      return await UserController.put(req, res, context);
    });

    router.put(`/:id`, auth.authenticate, async (req, res) => {
      /*
        #swagger.summary = 'Update user data by ID'
        #swagger.description = 'This endpoint will update user data by ID'
        #swagger.path = '/user/{id}'
        #swagger.method = 'put'
        #swagger.parameters = [
          { name: 'id', in: 'path', description: 'User ID', required: true, schema: { type: 'string' } },
        ]
        #swagger.requestBody = {
          description: 'User fields to update',
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/userRequest' } } },
        }
        #swagger.responses[200] = {
          description: 'User updated successfully',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/userDataResponse'
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
      return await UserController.put(req, res, context);
    });

    router.put(`/`, auth.authenticate, async (req, res) => {
      return await UserController.put(req, res, context);
    });

    router.delete(`/:id`, auth.authenticate, async (req, res) => {
      /*
        #swagger.summary = 'Delete user data by ID'
        #swagger.description = 'This endpoint deletes user data by ID, the path ID must match with the ID of the authenticated user'
        #swagger.path = '/user/{id}'
        #swagger.method = 'delete'
        #swagger.parameters = [
          { name: 'id', in: 'path', description: 'User ID', required: true, schema: { type: 'string' } },
        ]
        #swagger.responses[200] = {
          description: 'get user successfully',
          content: {
              'application/json': {
                  schema: {
                    $ref: '#/components/schemas/userDataResponse'
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
      return await UserController.delete(req, res, context);
    });

    router.delete(`/`, auth.authenticate, async (req, res) => {
      return await UserController.delete(req, res, context);
    });

    return router;
  },
};
