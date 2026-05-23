import { moderatorGuard } from '../../server/auth.js';
import { loggerFactory } from '../../server/logger.js';
import { HealthcareAppointmentController } from './healthcare-appointment.controller.js';
import express from 'express';

const logger = loggerFactory(import.meta);

class HealthcareAppointmentRouter {
  /**
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    router.post(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await HealthcareAppointmentController.post(req, res, options),
    );
    router.post(`/`, async (req, res) => await HealthcareAppointmentController.post(req, res, options));
    router.get(`/appointment-dates`, async (req, res) => await HealthcareAppointmentController.get(req, res, options));
    router.get(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await HealthcareAppointmentController.get(req, res, options),
    );
    router.get(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await HealthcareAppointmentController.get(req, res, options),
    );
    router.put(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await HealthcareAppointmentController.put(req, res, options),
    );
    router.put(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await HealthcareAppointmentController.put(req, res, options),
    );
    router.delete(
      `/:id`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await HealthcareAppointmentController.delete(req, res, options),
    );
    router.delete(
      `/`,
      options.authMiddleware,
      moderatorGuard,
      async (req, res) => await HealthcareAppointmentController.delete(req, res, options),
    );
    return router;
  }
}

const ApiRouter = (options) => HealthcareAppointmentRouter.router(options);

export { ApiRouter, HealthcareAppointmentRouter };
