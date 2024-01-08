import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { UserController } from './user.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const UserRouter = (options) => {
  const router = express.Router();
  router.post(endpoint, async (req, res) => await UserController.post(req, res, options));
  router.get(`${endpoint}/:id`, async (req, res) => await UserController.get(req, res, options));
  router.delete(`${endpoint}/:id`, async (req, res) => await UserController.delete(req, res, options));
  return router;
};

const ApiRouter = UserRouter;

export { ApiRouter, UserRouter };
