import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaWorldController } from './cyberia-world.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const CyberiaWorldRouter = (options) => {
  const router = express.Router();
  router.post(endpoint, async (req, res) => await CyberiaWorldController.post(req, res, options));
  router.get(`${endpoint}/:id`, async (req, res) => await CyberiaWorldController.get(req, res, options));
  router.delete(`${endpoint}/:id`, async (req, res) => await CyberiaWorldController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaWorldRouter;

export { ApiRouter, CyberiaWorldRouter };
