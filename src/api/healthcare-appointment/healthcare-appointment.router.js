import { authMiddleware } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { HealthcareAppointmentController } from './healthcare-appointment.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const HealthcareAppointmentRouter = (options) => {
  const router = express.Router();
  router.post(`/:id`, async (req, res) => await HealthcareAppointmentController.post(req, res, options));
  router.post(`/`, async (req, res) => await HealthcareAppointmentController.post(req, res, options));
  router.get(`/:id`, async (req, res) => await HealthcareAppointmentController.get(req, res, options));
  router.get(`/`, async (req, res) => await HealthcareAppointmentController.get(req, res, options));
  router.put(`/:id`, async (req, res) => await HealthcareAppointmentController.put(req, res, options));
  router.put(`/`, async (req, res) => await HealthcareAppointmentController.put(req, res, options));
  router.delete(`/:id`, async (req, res) => await HealthcareAppointmentController.delete(req, res, options));
  router.delete(`/`, async (req, res) => await HealthcareAppointmentController.delete(req, res, options));
  return router;
};

const ApiRouter = HealthcareAppointmentRouter;

export { ApiRouter, HealthcareAppointmentRouter };
