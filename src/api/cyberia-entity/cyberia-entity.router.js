import { loggerFactory } from '../../server/logger.js';
import { CyberiaEntityController } from './cyberia-entity.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaEntityRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CyberiaEntityController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaEntityController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await CyberiaEntityController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await CyberiaEntityController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaEntityController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaEntityController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaEntityController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaEntityController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaEntityRouter;

export { ApiRouter, CyberiaEntityRouter };
