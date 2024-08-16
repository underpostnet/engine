import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { UserGroupController } from './user-group.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const UserGroupRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await UserGroupController.post(req, res, options));
  router.post(`/`, async (req, res) => await UserGroupController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await UserGroupController.get(req, res, options));
  router.get(`/`, async (req, res) => await UserGroupController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await UserGroupController.put(req, res, options));
  router.put(`/`, async (req, res) => await UserGroupController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await UserGroupController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await UserGroupController.delete(req, res, options));
  return router;
};

const ApiRouter = UserGroupRouter;

export { ApiRouter, UserGroupRouter };
