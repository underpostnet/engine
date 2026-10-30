import { hashPassword } from '../../server/security/auth.js';
import fs from 'fs-extra';
import { loggerFactory } from '../../server/ops/logger.js';
import { UserController } from './user.controller.js';
import express from 'express';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';

const logger = loggerFactory(import.meta);

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

class UserRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();

    // Admin user seed — fire-and-forget async on first router mount.
    (async () => {
      try {
        const User = DataBaseProviderService.getModel('user', options);
        // Production connections build no index on their own; the unique email and username indexes are the authority.
        await User.createIndexes().catch((error) => logger.error('User index build failed', { error: error.message }));
        const adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
          const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'changethis';
          const hashedPassword = await hashPassword(defaultPassword);

          const result = await User.create({
            username: 'admin',
            email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@' + options.host,
            password: hashedPassword,
            role: 'admin',
            emailConfirmed: true,
          });
          logger.warn('Default admin user created. Please change the default password immediately!', {
            username: result._doc.username,
            email: result._doc.email,
            role: result._doc.role,
          });
        }
      } catch (error) {
        logger.error('Error checking/creating admin user', { error: error.message });
      }

      // Cache mailer images into options.png so route handlers can serve them
      // without re-reading the filesystem on every request.
      options.png = {
        buffer: {
          'invalid-token': fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-invalid-token.png`),
          recover: fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-recover.png`),
          check: fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-check.png`),
          avatar: fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-default-avatar.png`),
        },
        header: (res, req) => {
          res.set('Cross-Origin-Resource-Policy', 'cross-origin');
          res.set('Access-Control-Allow-Headers', '*');
          if (req && req.headers && req.headers.origin) {
            res.set('Access-Control-Allow-Origin', req.headers.origin);
          } else res.setHeader('Access-Control-Allow-Origin', '*');
          res.set('Content-Type', 'image/png');
        },
      };
    })();

    router.post(`/mailer/:id`, options.authMiddleware, async (req, res) => {
      return await UserController.post(req, res, options);
    });

    router.get(`/assets/:id`, async (req, res) => {
      return await UserController.get(req, res, options);
    });

    router.get(`/mailer/:id`, async (req, res) => {
      return await UserController.get(req, res, options);
    });

    router.get(`/email/:email`, options.authMiddleware, async (req, res) => {
      return await UserController.get(req, res, options);
    });

    router.post(`/:id`, async (req, res) => {
      return await UserController.post(req, res, options);
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
      return await UserController.post(req, res, options);
    });

    router.get(`/recover/:id`, async (req, res) => {
      return await UserController.get(req, res, options);
    });

    router.get(`/username/:username`, async (req, res) => {
      return await UserController.get(req, res, options);
    });

    router.get(`/:id`, options.authMiddleware, async (req, res) => {
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
      return await UserController.get(req, res, options);
    });

    router.get(`/`, options.authMiddleware, async (req, res) => {
      return await UserController.get(req, res, options);
    });

    router.put(`/recover/:id`, async (req, res) => {
      return await UserController.put(req, res, options);
    });

    router.put(`/profile-image/:id`, options.authMiddleware, async (req, res) => {
      return await UserController.put(req, res, options);
    });

    router.put(`/:id`, options.authMiddleware, async (req, res) => {
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
      return await UserController.put(req, res, options);
    });

    router.put(`/`, options.authMiddleware, async (req, res) => {
      return await UserController.put(req, res, options);
    });

    router.delete(`/:id`, options.authMiddleware, async (req, res) => {
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
      return await UserController.delete(req, res, options);
    });

    router.delete(`/`, options.authMiddleware, async (req, res) => {
      return await UserController.delete(req, res, options);
    });

    return router;
  }
}

const ApiRouter = (options) => UserRouter.router(options);

export { ApiRouter, UserRouter };
