import { loggerFactory } from '../../server/logger.js';
import { CyberiaInstanceController } from './cyberia-instance.controller.js';
import { userGuard, adminGuard } from '../../server/auth.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaInstanceRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(
    `/:id`,
    authMiddleware,
    userGuard,
    async (req, res) => await CyberiaInstanceController.post(req, res, options),
  );
  router.post(
    `/`,
    authMiddleware,
    userGuard,
    async (req, res) => await CyberiaInstanceController.post(req, res, options),
  );
  router.get(`/:id`, async (req, res) => await CyberiaInstanceController.get(req, res, options));
  router.get(`/`, async (req, res) => await CyberiaInstanceController.get(req, res, options));
  router.put(
    `/:id`,
    authMiddleware,
    userGuard,
    async (req, res) => await CyberiaInstanceController.put(req, res, options),
  );
  router.put(
    `/`,
    authMiddleware,
    userGuard,
    async (req, res) => await CyberiaInstanceController.put(req, res, options),
  );
  router.delete(
    `/:id`,
    authMiddleware,
    userGuard,
    async (req, res) => await CyberiaInstanceController.delete(req, res, options),
  );
  router.delete(
    `/`,
    authMiddleware,
    adminGuard,
    async (req, res) => await CyberiaInstanceController.delete(req, res, options),
  );
  return router;
};

const ApiRouter = CyberiaInstanceRouter;

export { ApiRouter, CyberiaInstanceRouter };
