import express from 'express';
import { startProceduralWorker } from '../../projects/cyberia/procedural/jobs/worker.js';
import { CyberiaProceduralJobController } from './cyberia-procedural-job.controller.js';

/*
  #swagger.components.schemas.ProceduralApprovalRequest = {
    type: 'object',
    required: ['cid'],
    properties: {
      cid: { type: 'string', description: 'The cid of the revision the approval covers.' },
      reason: { type: 'string', description: 'Why the reviewer approves it.' },
    },
  }
  #swagger.components.schemas.ProceduralRejectionRequest = {
    type: 'object',
    properties: { reason: { type: 'string', description: 'Why the reviewer rejects it.' } },
  }
*/

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cyberia-procedural-job',
  services: ['database', 'auth'],
  /**
   * Starts the background worker of the host path.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {Promise<void>}
   */
  initialize: async (context) => {
    startProceduralWorker(context);
  },
  /**
   * The Procedural Engine API: every route needs a moderator.
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    const guards = auth.requireModerator;
    const handle = (method) => async (req, res) => await CyberiaProceduralJobController[method](req, res, context);
    router.post(`/`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Create a generation job'
        #swagger.description = 'Validates a request of one mode: update-existing { mode, source: { itemIds }, palette, output: { variantsPerItem }, variation, seed } or create-new { mode, itemType, template, palette, output: { variants, itemIdPrefix }, variation, seed }. Stores its job and candidates and returns the job at once. The background worker generates the candidates. The same spec returns the same job.'
        #swagger.path = '/cyberia-procedural-job'
        #swagger.method = 'post'
      */
      return await handle('post')(req, res);
    });
    router.get(`/sources`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'List the existing items an update can target'
        #swagger.description = 'Paginated list of the Cyberia items bound to a definition: item id, item type, art direction, biomes, palette colors, whether it has a render, and its current cid. filterModel and sortModel apply to itemId, itemType, hasRender, currentCid and updatedAt.'
        #swagger.path = '/cyberia-procedural-job/sources'
        #swagger.method = 'get'
      */
      return await handle('sources')(req, res);
    });
    router.get(`/sources/:itemId/palette`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'The palette an update starts from for one item'
        #swagger.description = 'The Genesis Template an update takes for the item, its foundation palettes, and the default color of each color slot with its origin under the palette ?paletteId= names: palette or foundation (applied as they are), render or template (moved by the palette variation).'
        #swagger.path = '/cyberia-procedural-job/sources/{itemId}/palette'
        #swagger.method = 'get'
      */
      return await handle('sourcePalette')(req, res);
    });
    router.get(`/`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'List generation jobs'
        #swagger.description = 'Paginated list of jobs, newest first. filterModel and sortModel apply to the job fields and the spec.'
        #swagger.path = '/cyberia-procedural-job'
        #swagger.method = 'get'
      */
      return await handle('get')(req, res);
    });
    router.get(`/:jobId`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Get a generation job'
        #swagger.description = 'The job with its spec and the persisted count of its items by status.'
        #swagger.path = '/cyberia-procedural-job/{jobId}'
        #swagger.method = 'get'
      */
      return await handle('get')(req, res);
    });
    router.get(`/:jobId/items`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'List the candidates of a job'
        #swagger.description = 'Paginated list of the candidates of a job. filterModel and sortModel apply to the candidate fields.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/items'
        #swagger.method = 'get'
      */
      return await handle('getItems')(req, res);
    });
    router.get(`/:jobId/items/:itemId`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Get a candidate with its provenance'
        #swagger.description = 'The candidate, the run that made it and its audit trail.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/items/{itemId}'
        #swagger.method = 'get'
      */
      return await handle('getItems')(req, res);
    });
    router.delete(`/:jobId`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Delete a job'
        #swagger.description = 'Stops the work of the job if it still works, then removes it, its candidates, their draft revisions with every record stored under them, and its audit trail. A promoted item keeps its definition.'
        #swagger.path = '/cyberia-procedural-job/{jobId}'
        #swagger.method = 'delete'
      */
      return await handle('delete')(req, res);
    });
    router.post(`/:jobId/cancel`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Cancel a job'
        #swagger.description = 'Cancels the workflow: waiting, running, review and edit candidates are cancelled. Nothing is deleted: candidates, revisions and approved candidates stay.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/cancel'
        #swagger.method = 'post'
      */
      return await handle('cancel')(req, res);
    });
    router.post(`/:jobId/items/:itemId/regenerate`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Regenerate an item'
        #swagger.description = 'Queues the item for a new generation under a new seed. Its stored revisions stay.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/items/{itemId}/regenerate'
        #swagger.method = 'post'
      */
      return await handle('regenerate')(req, res);
    });
    router.post(`/:jobId/items/:itemId/approve`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Approve a revision'
        #swagger.description = 'Approves the revision the cid names. It must be the current revision of the item and technically valid, and no other candidate of the target item may be approved.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/items/{itemId}/approve'
        #swagger.method = 'post'
        #swagger.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProceduralApprovalRequest' },
              examples: { approval: { summary: 'Approve the current revision', value: { cid: '<revision-cid>', reason: 'Reviewed' } } },
            },
          },
        }
        #swagger.responses[409] = {
          description: 'The cid is not the current revision, the revision is not technically valid, or another candidate of the target item is approved.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        }
      */
      return await handle('approve')(req, res);
    });
    router.post(`/:jobId/items/:itemId/reject`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Reject an item'
        #swagger.description = 'Rejects the current revision of the item.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/items/{itemId}/reject'
        #swagger.method = 'post'
        #swagger.requestBody = {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProceduralRejectionRequest' },
              examples: { rejection: { summary: 'Reject with a reason', value: { reason: 'The silhouette breaks the palette' } } },
            },
          },
        }
      */
      return await handle('reject')(req, res);
    });
    router.post(`/:jobId/items/:itemId/edit`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Open an item for a visual edit'
        #swagger.description = 'Returns the review context the Object Layer Studio opens. The edit is a save through the Object Layer API.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/items/{itemId}/edit'
        #swagger.method = 'post'
      */
      return await handle('edit')(req, res);
    });
    router.post(`/:jobId/items/:itemId/promote`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Promote an approved candidate'
        #swagger.description = 'An update replaces the definition of the existing target item and answers 409 when the item changed since the run. A create makes the new item and answers 409 when its id is taken.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/items/{itemId}/promote'
        #swagger.method = 'post'
      */
      return await handle('promote')(req, res);
    });
    router.post(`/:jobId/promote`, ...guards, async (req, res) => {
      /*
        #swagger.summary = 'Promote the approved candidates of a job'
        #swagger.description = 'Promotes each approved candidate. A candidate that fails stays approved and is reported.'
        #swagger.path = '/cyberia-procedural-job/{jobId}/promote'
        #swagger.method = 'post'
      */
      return await handle('promoteJob')(req, res);
    });
    return router;
  },
};
