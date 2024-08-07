import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { NotificationController } from './notification.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const NotificationRouter = (options) => {
  const router = express.Router();
  const endpoint = 'notification';
  router.post(`/${endpoint}/:id`, async (req, res) => await NotificationController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await NotificationController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await NotificationController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await NotificationController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await NotificationController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await NotificationController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await NotificationController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await NotificationController.delete(req, res, options));
  return router;
};

const ApiRouter = NotificationRouter;

export { ApiRouter, NotificationRouter };
