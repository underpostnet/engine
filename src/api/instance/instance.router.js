import { adminGuard, authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { InstanceController } from './instance.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const InstanceRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, authMiddleware, adminGuard, async (req, res) => await InstanceController.post(req, res, options));
  router.post(`/`, authMiddleware, adminGuard, async (req, res) => await InstanceController.post(req, res, options));
  router.get(`/:id`, authMiddleware, adminGuard, async (req, res) => await InstanceController.get(req, res, options));
  router.get(`/`, authMiddleware, async (req, res) => await InstanceController.get(req, res, options));
  router.put(`/:id`, authMiddleware, adminGuard, async (req, res) => await InstanceController.put(req, res, options));
  router.put(`/`, authMiddleware, adminGuard, async (req, res) => await InstanceController.put(req, res, options));
  router.delete(
    `/:id`,
    authMiddleware,
    adminGuard,
    async (req, res) => await InstanceController.delete(req, res, options),
  );
  router.delete(
    `/`,
    authMiddleware,
    adminGuard,
    async (req, res) => await InstanceController.delete(req, res, options),
  );
  return router;
};

const ApiRouter = InstanceRouter;

export { ApiRouter, InstanceRouter };
