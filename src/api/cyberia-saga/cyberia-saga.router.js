import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CyberiaSagaController } from './cyberia-saga.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-saga',
  services: ['database', 'auth'],
  /**
   * Reads, the synchronization preview among them, are public; the saga catalog, the completeness
   * report and a synchronization need a moderator.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const sync = async (req, res) => await CyberiaSagaController.sync(req, res, context);
    router.get(`/sources`, async (req, res) => await CyberiaSagaController.sources(req, res, context));
    router.get(`/sync/:code`, sync);
    router.post(`/sync/:code`, auth.requireModerator, sync);
    router.get(`/catalog`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'List the sagas of a host'
        #swagger.description = 'A page of every saga the content source checkout, the content artifact, the workspace database and the Saga Engine workflows hold, one row per saga code. Each row keeps the state of each source apart: source, artifact, workspace import status, the selected release, the workflow stage, the counts, the shared maps and items, the worlds and the placement progress. Filters: q, source, artifact, workspace, release, instance, workflow, page, limit. Writes nothing.'
        #swagger.path = '/cyberia-saga/catalog'
        #swagger.method = 'get'
      */
      return await CyberiaSagaController.catalog(req, res, context);
    });
    router.get(`/report/:code`, auth.requireModerator, async (req, res) => {
      /*
        #swagger.summary = 'Read the completeness report of a saga'
        #swagger.description = 'The completeness report of a saga of the served content artifact: one row per dependency with its status, remedy and owner editor, the semantic, narrative, gameplay, visual, spatial, economy and release gates, the reference and quest graphs, and the synchronization plan. Writes nothing.'
        #swagger.path = '/cyberia-saga/report/{code}'
        #swagger.method = 'get'
      */
      return await CyberiaSagaController.report(req, res, context);
    });
    return registerCrudRoutes(router, CyberiaSagaController, context);
  },
};
