import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaInstanceController } from './cyberia-instance.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaInstanceRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await CyberiaInstanceController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaInstanceController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await CyberiaInstanceController.get(req, res, options));
  router.get(`/`, async (req, res) => await CyberiaInstanceController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaInstanceController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaInstanceController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaInstanceController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaInstanceController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaInstanceRouter;

export { ApiRouter, CyberiaInstanceRouter };
