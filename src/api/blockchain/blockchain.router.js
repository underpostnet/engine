import { loggerFactory } from '../../server/logger.js';
import { BlockChainController } from './blockchain.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const BlockChainRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await BlockChainController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await BlockChainController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await BlockChainController.get(req, res, options));
  router.get(`/`, async (req, res) => await BlockChainController.get(req, res, options));
  router.delete(`/:id`, async (req, res) => await BlockChainController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await BlockChainController.delete(req, res, options));
  return router;
};

const ApiRouter = BlockChainRouter;

export { ApiRouter, BlockChainRouter };
