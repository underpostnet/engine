import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaUserController } from './cyberia-user.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const CyberiaUserRouter = (options) => {
  const router = express.Router();

  router.post(`${endpoint}/:id`, async (req, res) => await CyberiaUserController.post(req, res, options));
  router.post(`${endpoint}`, async (req, res) => await CyberiaUserController.post(req, res, options));

  router.get(`${endpoint}/:id`, authMiddleware, async (req, res) => await CyberiaUserController.get(req, res, options));
  router.get(`${endpoint}`, authMiddleware, async (req, res) => await CyberiaUserController.get(req, res, options));

  router.put(`${endpoint}/:id`, authMiddleware, async (req, res) => await CyberiaUserController.put(req, res, options));
  router.put(`${endpoint}`, authMiddleware, async (req, res) => await CyberiaUserController.put(req, res, options));

  // router.delete(`${endpoint}/:id`, async (req, res) => await CyberiaUserController.delete(req, res, options));

  return router;
};

const ApiRouter = CyberiaUserRouter;

export { ApiRouter, CyberiaUserRouter };
