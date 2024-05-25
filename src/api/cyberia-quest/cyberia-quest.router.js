import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaQuestController } from './cyberia-quest.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaQuestRouter = (options) => {
  const router = express.Router();
  const endpoint = 'cyberia-quest';
  router.post(`/${endpoint}/:id`, async (req, res) => await CyberiaQuestController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await CyberiaQuestController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await CyberiaQuestController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await CyberiaQuestController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await CyberiaQuestController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await CyberiaQuestController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await CyberiaQuestController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaQuestRouter;

export { ApiRouter, CyberiaQuestRouter };
