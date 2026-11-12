import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { EventSchedulerController } from './event-scheduler.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'event-scheduler',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.get(
      `/creatorUser`,
      auth.authenticate,
      async (req, res) => await EventSchedulerController.get(req, res, context),
    );
    router.get(
      `/creatorUser/:id`,
      auth.authenticate,
      async (req, res) => await EventSchedulerController.get(req, res, context),
    );
    // Collection delete uses moderator (not admin) guard, matching prior behavior.
    return registerCrudRoutes(router, EventSchedulerController, context, {
      deleteAllGuards: auth.requireModerator,
    });
  },
};
