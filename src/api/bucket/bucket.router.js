import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { BucketController } from './bucket.controller.js';
import express from 'express';
import fs from 'fs-extra';

const endpoint = endpointFactory(import.meta);
const meta = { url: `api-${endpoint}-router` };
const logger = loggerFactory(meta);

const BucketRouter = (options) => {
  const router = express.Router();
  fs.mkdirSync(`./bkt/${options.host}${options.path}/`, { recursive: true });
  router.post(`${endpoint}/:id`, authMiddleware, async (req, res) => await BucketController.post(req, res, options));
  router.post(`${endpoint}`, authMiddleware, async (req, res) => await BucketController.post(req, res, options));
  router.get(`${endpoint}/:id`, authMiddleware, async (req, res) => await BucketController.get(req, res, options));
  router.get(`${endpoint}`, authMiddleware, async (req, res) => await BucketController.get(req, res, options));
  router.put(`${endpoint}/:id`, authMiddleware, async (req, res) => await BucketController.put(req, res, options));
  router.put(`${endpoint}`, authMiddleware, async (req, res) => await BucketController.put(req, res, options));
  router.delete(
    `${endpoint}/:id/:filesId`,
    authMiddleware,
    async (req, res) => await BucketController.delete(req, res, options),
  );
  router.delete(
    `${endpoint}/:id`,
    authMiddleware,
    async (req, res) => await BucketController.delete(req, res, options),
  );
  router.delete(`${endpoint}`, authMiddleware, async (req, res) => await BucketController.delete(req, res, options));
  return router;
};

const ApiRouter = BucketRouter;

export { ApiRouter, BucketRouter };
