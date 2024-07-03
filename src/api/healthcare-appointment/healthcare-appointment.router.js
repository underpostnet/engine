import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { HealthcareAppointmentController } from './healthcare-appointment.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const HealthcareAppointmentRouter = (options) => {
  const router = express.Router();
  const endpoint = 'healthcare-appointment';
  router.post(`/${endpoint}/:id`, async (req, res) => await HealthcareAppointmentController.post(req, res, options));
  router.post(`/${endpoint}`, async (req, res) => await HealthcareAppointmentController.post(req, res, options));
  router.get(`/${endpoint}/:id`, async (req, res) => await HealthcareAppointmentController.get(req, res, options));
  router.get(`/${endpoint}`, async (req, res) => await HealthcareAppointmentController.get(req, res, options));
  router.put(`/${endpoint}/:id`, async (req, res) => await HealthcareAppointmentController.put(req, res, options));
  router.put(`/${endpoint}`, async (req, res) => await HealthcareAppointmentController.put(req, res, options));
  router.delete(`/${endpoint}/:id`, async (req, res) => await HealthcareAppointmentController.delete(req, res, options));
  router.delete(`/${endpoint}`, async (req, res) => await HealthcareAppointmentController.delete(req, res, options));
  return router;
};

const ApiRouter = HealthcareAppointmentRouter;

export { ApiRouter, HealthcareAppointmentRouter };
