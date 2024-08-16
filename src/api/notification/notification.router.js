import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { NotificationController } from './notification.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const NotificationRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await NotificationController.post(req, res, options));
  router.post(`/`, async (req, res) => await NotificationController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await NotificationController.get(req, res, options));
  router.get(`/`, async (req, res) => await NotificationController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await NotificationController.put(req, res, options));
  router.put(`/`, async (req, res) => await NotificationController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await NotificationController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await NotificationController.delete(req, res, options));
  return router;
};

const ApiRouter = NotificationRouter;

export { ApiRouter, NotificationRouter };
