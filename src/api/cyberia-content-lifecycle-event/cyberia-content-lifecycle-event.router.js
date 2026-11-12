import express from 'express';
import { CyberiaContentLifecycleEventController } from './cyberia-content-lifecycle-event.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-content-lifecycle-event',
  services: ['database', 'auth'],
  /**
   * Read-only, for moderators: the journal is append-only, and the CLI of each host appends to it.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.get(`/`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Read the journal of a content lifecycle'
        #swagger.description = 'A page of the events of the cycle { cycleId }, newest first: operation, stage, status, host, actor, times, attempt, input fingerprint, result summary, references and error.'
        #swagger.path = '/cyberia-content-lifecycle-event'
        #swagger.method = 'get'
      */
      return await CyberiaContentLifecycleEventController.get(req, res, context);
    });
    return router;
  },
};
