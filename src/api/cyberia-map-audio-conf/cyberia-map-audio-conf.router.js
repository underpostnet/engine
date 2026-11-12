import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaMapAudioConfController } from './cyberia-map-audio-conf.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-map-audio-conf',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();

    // Map-code routes are registered before the CRUD routes: the generic `/:id`
    // handlers capture every single-segment path once they are mounted.
    router.get(
      '/map-code/:mapCode',
      async (req, res) => await CyberiaMapAudioConfController.getByMapCode(req, res, context),
    );
    router.post(
      '/map-code/:mapCode',
      auth.requireModerator,
      async (req, res) => await CyberiaMapAudioConfController.assign(req, res, context),
    );
    router.post(
      '/map-code/:mapCode/seed-default',
      auth.requireModerator,
      async (req, res) => await CyberiaMapAudioConfController.seedDefault(req, res, context),
    );

    return registerCrudRoutes(router, CyberiaMapAudioConfController, context);
  },
};
