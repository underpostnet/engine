import { loggerFactory } from '../../server/logger.js';
import { CyberiaQuestController } from './cyberia-quest.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaQuestRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CyberiaQuestController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaQuestController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await CyberiaQuestController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await CyberiaQuestController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaQuestController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaQuestController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaQuestRouter;

export { ApiRouter, CyberiaQuestRouter };
