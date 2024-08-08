import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { UserGroupController } from './user-group.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const UserGroupRouter = (options) => {
  const router = express.Router();
  const endpoint = 'user-group';
  router.post(`/${endpoint}/:id`, async (req, res) => await UserGroupController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await UserGroupController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await UserGroupController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await UserGroupController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await UserGroupController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await UserGroupController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await UserGroupController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await UserGroupController.delete(req, res, options));
  return router;
};

const ApiRouter = UserGroupRouter;

export { ApiRouter, UserGroupRouter };
