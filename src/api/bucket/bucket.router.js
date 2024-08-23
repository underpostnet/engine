import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { BucketController } from './bucket.controller.js';
import express from 'express';
import fs from 'fs-extra';
const logger = loggerFactory(import.meta);

const BucketRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, authMiddleware, async (req, res) => await BucketController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await BucketController.post(req, res, options));
  router.get(`/:id`, authMiddleware, async (req, res) => await BucketController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await BucketController.get(req, res, options));
  router.put(`/:id`, authMiddleware, async (req, res) => await BucketController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await BucketController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, async (req, res) => await BucketController.delete(req, res, options));
  router.delete(`/`, authMiddleware, async (req, res) => await BucketController.delete(req, res, options));
  return router;
};

const ApiRouter = BucketRouter;

export { ApiRouter, BucketRouter };
