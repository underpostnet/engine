import { loggerFactory } from '../../server/logger.js';
import { CyberiaQuestProgressController } from './cyberia-quest-progress.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaQuestProgressRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CyberiaQuestProgressController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaQuestProgressController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await CyberiaQuestProgressController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await CyberiaQuestProgressController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaQuestProgressController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaQuestProgressController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaQuestProgressController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaQuestProgressController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaQuestProgressRouter;

export { ApiRouter, CyberiaQuestProgressRouter };
