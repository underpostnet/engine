import { hashPassword } from '../../server/auth.js';
import fs from 'fs-extra';
import { loggerFactory } from '../../server/logger.js';
import { UserController } from './user.controller.js';
import express from 'express';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';

const logger = loggerFactory(import.meta);

const UserRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;

  (async () => {
    // admin user seed
    try {
      const models = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models;
      let adminUser;
      if (models.User) {
        adminUser = await models.User.findOne({ role: 'admin' });
        if (!adminUser) {
          const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'changethis';
          const hashedPassword = await hashPassword(defaultPassword);

          const result = await models.User.create({
            username: 'admin',
            email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@' + options.host,
            password: hashedPassword,
            role: 'admin',
            emailConfirmed: true,
            publicKey: [],
          });
          logger.warn('Default admin user created. Please change the default password immediately!', result._doc);
        }
      }
    } catch (error) {
      logger.error('Error checking/creating admin user');
      console.log(error);
    }

    // Cache mailer images
    options.png = {
      buffer: {
        'invalid-token': fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-invalid-token.png`),
        recover: fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-recover.png`),
        check: fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-check.png`),
        avatar: fs.readFileSync(`./src/client/public/default/assets/mailer/api-user-default-avatar.png`),
      },
      header: (res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Headers', '*');
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

  router.get(`/assets/:id`, async (req, res) => {
    /*
      #swagger.ignore = true
    */
    return await UserController.get(req, res, options);
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

  router.get(`/u/:username`, async (req, res) => {
    /*
      #swagger.auto = false
      #swagger.tags = ['user']
      #swagger.summary = 'Get public user profile'
      #swagger.description = 'This endpoint gets public user profile data by username (no auth required)'
      #swagger.path = '/user/u/{username}'
      #swagger.method = 'get'
      #swagger.produces = ['application/json']
      #swagger.consumes = ['application/json']

      #swagger.parameters['username'] = {
          in: 'path',
          description: 'User username',
          required: true,
          type: 'string'
      }

      #swagger.responses[200] = {
        description: 'get public user profile successfully',
        content: {
            'application/json': {
                schema: {
                  $ref: '#/components/schemas/userPublicResponse'
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

  // Username public profile redirect
  options.app.get(`${options.path === '/' ? '' : options.path}/u/:username`, async (req, res, next) =>
    res.redirect(`${options.path === '/' ? '' : options.path}/u?cid=${req.params.username}`),
  );

  return router;
};

const ApiRouter = UserRouter;

export { ApiRouter, UserRouter };
