import { loggerFactory } from '../../server/logger.js';
import { CyberiaAchievementController } from './cyberia-achievement.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const CyberiaAchievementRouter = (options) => {
  const router = express.Router();
  const authMiddleware = options.authMiddleware;
  router.post(`/:id`, async (req, res) => await CyberiaAchievementController.post(req, res, options));
  router.post(`/`, async (req, res) => await CyberiaAchievementController.post(req, res, options));
  router.get(
    `/:id`,
    // authMiddleware,
    async (req, res) => await CyberiaAchievementController.get(req, res, options),
  );
  router.get(`/`, async (req, res) => await CyberiaAchievementController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await CyberiaAchievementController.put(req, res, options));
  router.put(`/`, async (req, res) => await CyberiaAchievementController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await CyberiaAchievementController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await CyberiaAchievementController.delete(req, res, options));
  return router;
};

const ApiRouter = CyberiaAchievementRouter;

export { ApiRouter, CyberiaAchievementRouter };
