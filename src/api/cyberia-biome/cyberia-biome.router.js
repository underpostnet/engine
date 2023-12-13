import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { loggerFactory } from '../../server/logger.js';
import { GET, POST, DELETE } from './cyberia-biome.controller.js';
import express from 'express';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const ApiRouter = (options) => {
  const router = express.Router();
  router.post(endpoint, async (req, res) => await POST(req, res, options));
  router.get(`${endpoint}/:id`, async (req, res) => await GET(req, res, options));
  router.delete(`${endpoint}/:id`, async (req, res) => await DELETE(req, res, options));
  return router;
};

export { ApiRouter };
