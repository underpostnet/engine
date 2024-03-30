import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { BlockChainController } from './blockchain.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const BlockChainRouter = (options) => {
  const router = express.Router();
  const endpoint = 'blockchain';
  router.post(`/${endpoint}/:id`, async (req, res) => await BlockChainController.post(req, res, options));
  router.post(`/${endpoint}`, authMiddleware, async (req, res) => await BlockChainController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await BlockChainController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await BlockChainController.get(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await BlockChainController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await BlockChainController.delete(req, res, options));
  return router;
};

const ApiRouter = BlockChainRouter;

export { ApiRouter, BlockChainRouter };
