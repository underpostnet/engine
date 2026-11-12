import express from 'express';
import { CyberiaContentLifecycleController } from './cyberia-content-lifecycle.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-content-lifecycle',
  services: ['database', 'auth'],
  /**
   * Read-only, for moderators: each host writes its cycles through the `cyberia content lifecycle` CLI.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const guards = auth.requireModerator;
    const get = async (req, res) => await CyberiaContentLifecycleController.get(req, res, context);
    router.get(`/runtime`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Read the context of the content lifecycle monitor'
        #swagger.description = 'Where this engine reads the cycles (a share of the control node, the central runtime database, or a local development database), this node, the state of its share without its value, and, outside a container, its Development Sandbox: the target, the session, a check of each service, the workspace, the content artifact and the cyberia-content checkout.'
        #swagger.path = '/cyberia-content-lifecycle/runtime'
        #swagger.method = 'get'
      */
      return await CyberiaContentLifecycleController.runtime(req, res, context);
    });
    router.get(`/:id`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Read the plan of a content lifecycle'
        #swagger.description = 'The cycle: its scope, the ids of the records each domain owns, each stage with its execution for each target (completed, stale, failed, blocked or pending) and the host that recorded it, evaluated against the targets this engine observes, its shares, and the next stage with its contexts, target and commands.'
        #swagger.path = '/cyberia-content-lifecycle/{id}'
        #swagger.method = 'get'
      */
      return await get(req, res);
    });
    router.get(`/`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'List content lifecycles'
        #swagger.description = 'Paginated cycle summaries, newest change first: status, scope, completed stages and the next stage.'
        #swagger.path = '/cyberia-content-lifecycle'
        #swagger.method = 'get'
      */
      return await get(req, res);
    });
    return router;
  },
};
