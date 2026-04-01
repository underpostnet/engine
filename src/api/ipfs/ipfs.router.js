import { adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { IpfsController } from './ipfs.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const IpfsRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  // Health / audit — must come before /:id to avoid matching conflicts.
  router.get(`/verify`, authMiddleware, adminGuard, async (req, res) => await IpfsController.verify(req, res, options));
  router.post(`/:id`, authMiddleware, adminGuard, async (req, res) => await IpfsController.post(req, res, options));
  router.post(`/`, authMiddleware, adminGuard, async (req, res) => await IpfsController.post(req, res, options));
  router.get(`/:id`, authMiddleware, adminGuard, async (req, res) => await IpfsController.get(req, res, options));
  router.get(`/`, authMiddleware, adminGuard, async (req, res) => await IpfsController.get(req, res, options));
  router.put(`/:id`, authMiddleware, adminGuard, async (req, res) => await IpfsController.put(req, res, options));
  router.put(`/`, authMiddleware, adminGuard, async (req, res) => await IpfsController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, adminGuard, async (req, res) => await IpfsController.delete(req, res, options));
  router.delete(`/`, authMiddleware, adminGuard, async (req, res) => await IpfsController.delete(req, res, options));
  return router;
};

const ApiRouter = IpfsRouter;

export { ApiRouter, IpfsRouter };
