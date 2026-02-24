import { adminGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { IpfsController } from './ipfs.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const IpfsRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/pin`, authMiddleware, adminGuard, async (req, res) => await IpfsController.pin(req, res, options));
  router.delete(
    `/pin/:cid`,
    authMiddleware,
    adminGuard,
    async (req, res) => await IpfsController.unpin(req, res, options),
  );
  router.post(`/:id`, authMiddleware, async (req, res) => await IpfsController.post(req, res, options));
  router.post(`/`, authMiddleware, async (req, res) => await IpfsController.post(req, res, options));
  router.get(`/:id`, authMiddleware, async (req, res) => await IpfsController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await IpfsController.get(req, res, options));
  router.put(`/:id`, authMiddleware, async (req, res) => await IpfsController.put(req, res, options));
  router.put(`/`, authMiddleware, async (req, res) => await IpfsController.put(req, res, options));
  router.delete(`/:id`, authMiddleware, adminGuard, async (req, res) => await IpfsController.delete(req, res, options));
  router.delete(`/`, authMiddleware, adminGuard, async (req, res) => await IpfsController.delete(req, res, options));
  return router;
};

const ApiRouter = IpfsRouter;

export { ApiRouter, IpfsRouter };
