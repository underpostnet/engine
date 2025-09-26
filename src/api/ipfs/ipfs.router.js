import { loggerFactory } from '../../server/logger.js';
import { IPFSController } from './ipfs.controller.js';
import express from 'express';
const logger = loggerFactory(import.meta);

const IPFSRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await IPFSController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await IPFSController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await IPFSController.get(req, res, options));
  router.get(`/`, async (req, res) => await IPFSController.get(req, res, options));
  router.delete(`/:id`, async (req, res) => await IPFSController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await IPFSController.delete(req, res, options));
  return router;
};

const ApiRouter = IPFSRouter;

export { ApiRouter, IPFSRouter };
