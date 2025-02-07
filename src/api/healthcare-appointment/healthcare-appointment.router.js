import { authMiddleware, moderatorGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { HealthcareAppointmentController } from './healthcare-appointment.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

const HealthcareAppointmentRouter = (options) => {
  const router = express.Router();
  router.post(
    `/:id`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await HealthcareAppointmentController.post(req, res, options),
  );
  router.post(`/`, async (req, res) => await HealthcareAppointmentController.post(req, res, options));
  router.get(`/appointment-dates`, async (req, res) => await HealthcareAppointmentController.get(req, res, options));
  router.get(
    `/:id`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await HealthcareAppointmentController.get(req, res, options),
  );
  router.get(
    `/`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await HealthcareAppointmentController.get(req, res, options),
  );
  router.put(
    `/:id`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await HealthcareAppointmentController.put(req, res, options),
  );
  router.put(
    `/`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await HealthcareAppointmentController.put(req, res, options),
  );
  router.delete(
    `/:id`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await HealthcareAppointmentController.delete(req, res, options),
  );
  router.delete(
    `/`,
    authMiddleware,
    moderatorGuard,
    async (req, res) => await HealthcareAppointmentController.delete(req, res, options),
  );
  return router;
};

const ApiRouter = HealthcareAppointmentRouter;

export { ApiRouter, HealthcareAppointmentRouter };
