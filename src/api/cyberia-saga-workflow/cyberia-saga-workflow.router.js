import express from 'express';
import { startSagaWorker } from '../../projects/cyberia/saga/saga-generation.js';
import { CyberiaSagaWorkflowController } from './cyberia-saga-workflow.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-saga-workflow',
  services: ['database', 'auth'],
  /**
   * Starts the generation worker of the host path.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {Promise<void>}
   */
  initialize: async (context) => {
    startSagaWorker(context);
  },
  /**
   * The workflow API of the Saga Engine: every route needs a moderator.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const guards = auth.requireModerator;
    const handle = (method) => async (req, res) => await CyberiaSagaWorkflowController[method](req, res, context);
    router.get(`/`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'List saga workflows'
        #swagger.description = 'Paginated workflow summaries, newest change first: saga code, stage (generating, failed, draft, findings, checked, applied), candidates, newest generation and application.'
        #swagger.path = '/cyberia-saga-workflow'
        #swagger.method = 'get'
      */
      return await handle('get')(req, res);
    });
    router.post(`/`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Open or start a saga workflow'
        #swagger.description = 'Opens the saga { sagaCode } the content source holds as revision 1, or starts an empty workflow with { context }. Needs a cyberia-content source checkout to open a saga.'
        #swagger.path = '/cyberia-saga-workflow'
        #swagger.method = 'post'
      */
      return await handle('post')(req, res);
    });
    router.get(`/:id`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Read a saga workflow'
        #swagger.description = 'The workflow: summary, narrative context, candidates without packages, the newest package, generations with steps and logs, the last check, the application, exclusions and the newest history.'
        #swagger.path = '/cyberia-saga-workflow/{id}'
        #swagger.method = 'get'
      */
      return await handle('get')(req, res);
    });
    router.put(`/:id/context`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Set the narrative context'
        #swagger.description = 'Sets fields of the context of the next generation: prompt, lore, spaceContext, tone, factionContext, characterContext, culturalExposure, thinkingLevel, model, temperature, saga { code, name, description }, reuse and sagas.'
        #swagger.path = '/cyberia-saga-workflow/{id}/context'
        #swagger.method = 'put'
      */
      return await handle('context')(req, res);
    });
    router.post(`/:id/generations`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Queue a generation'
        #swagger.description = 'Freezes the request of the narrative context and the content provenance into the next generation. The background worker runs it step by step under a lease. 409 while a generation of the workflow runs.'
        #swagger.path = '/cyberia-saga-workflow/{id}/generations'
        #swagger.method = 'post'
      */
      return await handle('generate')(req, res);
    });
    router.get(`/:id/generations/:attempt`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Read a generation'
        #swagger.description = 'The generation with its frozen request, provenance, steps, logs and the generator state: the stage results a retry resumes from.'
        #swagger.path = '/cyberia-saga-workflow/{id}/generations/{attempt}'
        #swagger.method = 'get'
      */
      return await handle('generation')(req, res);
    });
    router.post(`/:id/generations/:attempt/cancel`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Cancel a generation'
        #swagger.description = 'Cancels a queued generation at once; a running one stops at its next check and stores nothing more.'
        #swagger.path = '/cyberia-saga-workflow/{id}/generations/{attempt}/cancel'
        #swagger.method = 'post'
      */
      return await handle('cancelGeneration')(req, res);
    });
    router.post(`/:id/generations/:attempt/retry`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Retry a generation'
        #swagger.description = 'Queues a failed or cancelled generation again; it resumes at its first step not done. 409 when the generator refused its request.'
        #swagger.path = '/cyberia-saga-workflow/{id}/generations/{attempt}/retry'
        #swagger.method = 'post'
      */
      return await handle('retryGeneration')(req, res);
    });
    router.get(`/:id/candidates/:revision`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Read a candidate'
        #swagger.description = 'One candidate revision with its package, kind, digest, parent and actor.'
        #swagger.path = '/cyberia-saga-workflow/{id}/candidates/{revision}'
        #swagger.method = 'get'
      */
      return await handle('candidate')(req, res);
    });
    router.post(`/:id/candidates`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Save a candidate'
        #swagger.description = 'Saves { package, parent } as the next revision. It writes nothing outside the workflow; a package equal to the newest adds nothing.'
        #swagger.path = '/cyberia-saga-workflow/{id}/candidates'
        #swagger.method = 'post'
      */
      return await handle('saveCandidate')(req, res);
    });
    router.post(`/:id/diff`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Diff a package'
        #swagger.description = 'The differences of { package } from the candidate { revision }: each changed, added or removed JSON path; definitions pair by id.'
        #swagger.path = '/cyberia-saga-workflow/{id}/diff'
        #swagger.method = 'post'
      */
      return await handle('diff')(req, res);
    });
    router.post(`/:id/validate`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Check a candidate'
        #swagger.description = 'Runs the cyberia-content rules on the candidate { revision } against the foundation and every other saga, and stores the findings with their JSON paths.'
        #swagger.path = '/cyberia-saga-workflow/{id}/validate'
        #swagger.method = 'post'
      */
      return await handle('validate')(req, res);
    });
    router.post(`/:id/apply`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Apply a candidate'
        #swagger.description = 'Writes the checked candidate { revision } to src/content/sagas/<code>.json in canonical form. 409 when it has findings, or the file changed outside the workflow. Nothing is built, imported or released.'
        #swagger.path = '/cyberia-saga-workflow/{id}/apply'
        #swagger.method = 'post'
      */
      return await handle('apply')(req, res);
    });
    router.put(`/:id/exclusions`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Exclude a report row'
        #swagger.description = 'Leaves the report row { key } out with a { reason }; an empty reason takes it back.'
        #swagger.path = '/cyberia-saga-workflow/{id}/exclusions'
        #swagger.method = 'put'
      */
      return await handle('exclusion')(req, res);
    });
    router.get(`/:id/report`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Read the completeness report'
        #swagger.description = 'The completeness report of the candidate ?revision= (the newest by default): one row per dependency with its status, remedy and owner editor, and the semantic, narrative, gameplay, visual, spatial, economy and release gates.'
        #swagger.path = '/cyberia-saga-workflow/{id}/report'
        #swagger.method = 'get'
      */
      return await handle('report')(req, res);
    });
    return router;
  },
};
