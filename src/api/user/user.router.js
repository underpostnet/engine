import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { UserController } from './user.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const UserRouter = (options) => {
  const router = express.Router();
  router.post(
    `/mailer/:id`,
    authMiddleware,
    async (req, res) => await UserController.post(req, res, { uri: '/mailer', ...options }),
  );
  router.get(`/mailer/:id`, async (req, res) => await UserController.get(req, res, { uri: '/mailer', ...options }));

  router.post(`/:id`, async (req, res) => await UserController.post(req, res, options));
  router.post(`/`, async (req, res) => await UserController.post(req, res, options));

  router.get(`/:id`, authMiddleware, async (req, res) => await UserController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await UserController.get(req, res, options));

  router.put(`/:id`, authMiddleware, async (req, res) => await UserController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await UserController.put(req, res, options));

  // router.delete(`/:id`, async (req, res) => await UserController.delete(req, res, options));

  return router;
};

const ApiRouter = UserRouter;

export { ApiRouter, UserRouter };
