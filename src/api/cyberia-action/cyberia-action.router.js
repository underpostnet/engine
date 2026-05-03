import { loggerFactory } from '../../server/logger.js';
import { CyberiaActionController } from './cyberia-action.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaActionRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CyberiaActionController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaActionController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await CyberiaActionController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await CyberiaActionController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaActionController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaActionController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaActionController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaActionController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaActionRouter;

export { ApiRouter, CyberiaActionRouter };
