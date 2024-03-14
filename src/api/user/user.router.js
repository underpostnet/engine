import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { UserController } from './user.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const UserRouter = (options) => {
  const router = express.Router();
  const endpoint = 'user';

  router.post(
    `/${endpoint}/mailer/:id`,
    authMiddleware,
    async (req, res) => await UserController.post(req, res, { uri: '/mailer', ...options }),
  );
  router.get(
    `/${endpoint}/mailer/:id`,
    async (req, res) => await UserController.get(req, res, { uri: '/mailer', ...options }),
  );

  router.post(`/${endpoint}/:id`, async (req, res) => await UserController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await UserController.post(req, res, options));

  router.get(`/${endpoint}/:id`, authMiddleware, async (req, res) => await UserController.get(req, res, options));
  router.get(`/${endpoint}`, authMiddleware, async (req, res) => await UserController.get(req, res, options));

  router.put(`/${endpoint}/:id`, authMiddleware, async (req, res) => await UserController.put(req, res, options));
  router.put(`/${endpoint}`, authMiddleware, async (req, res) => await UserController.put(req, res, options));

  // router.delete(`/${endpoint}/:id`, async (req, res) => await UserController.delete(req, res, options));

  return router;
};

const ApiRouter = UserRouter;

export { ApiRouter, UserRouter };
