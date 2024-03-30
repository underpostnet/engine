import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { IPFSController } from './ipfs.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const IPFSRouter = (options) => {
  const router = express.Router();
  const endpoint = 'ipfs';
  router.post(`/${endpoint}/:id`, async (req, res) => await IPFSController.post(req, res, options));
  router.post(`/${endpoint}`, authMiddleware, async (req, res) => await IPFSController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await IPFSController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await IPFSController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await IPFSController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await IPFSController.delete(req, res, options));
  return router;
};

const ApiRouter = IPFSRouter;

export { ApiRouter, IPFSRouter };
