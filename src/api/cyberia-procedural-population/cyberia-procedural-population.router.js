import express from 'express';
import { moderatorGuard } from '../../server/security/auth.js';
import { CyberiaProceduralPopulationController } from './cyberia-procedural-population.controller.js';

class CyberiaProceduralPopulationRouter {
  /**
   * The map population API of the Procedural Engine: every route needs a moderator.
   * @param {import('../types.js').RouterOptions} options
   * @returns {import('express').Router}
   */
  static router(options) {
    const router = express.Router();
    const guards = [options.authMiddleware, moderatorGuard];
    const handle = (method) => async (req, res) =>
      await CyberiaProceduralPopulationController[method](req, res, options);
    router.get(`/maps`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'List map summaries'
        #swagger.description = 'Paginated list of the maps: code, name, revision, grid, placed entities, instances, biome, the size of the foundation composition, and the state of the latest population of each. filterModel and sortModel apply to code, name, revision, entityCount and updatedAt.'
        #swagger.path = '/cyberia-procedural-population/maps'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('maps')(req, res);
    });
    router.get(`/maps/:code`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'The context of a map'
        #swagger.description = 'The map context a population reads now: the map, its instances, foundation, biome and palettes, the targets its composition and placements name with their recommended resolution, whether the served content is behind the content checkout, and the findings. Nothing is stored.'
        #swagger.path = '/cyberia-procedural-population/maps/{code}'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('mapContext')(req, res);
    });
    router.post(`/`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Create a population'
        #swagger.description = 'Creates the population of { mapCode, seed? }: it freezes the map context with a target for each item the map names. Equal inputs answer the same population.'
        #swagger.path = '/cyberia-procedural-population'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('post')(req, res);
    });
    router.get(`/`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'List populations'
        #swagger.description = 'Paginated populations, newest first, each with its item groups and its status; a record of an earlier version is outdated and read-only until `cyberia population migrate --apply` moves it, or a delete takes it.'
        #swagger.path = '/cyberia-procedural-population'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('get')(req, res);
    });
    router.get(`/:id`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Read a population'
        #swagger.description = 'The population with each item, its configuration, state, selected and newest entry and impact, the item groups, the draft summary, the entity-default changes, the publication, and the state of each step.'
        #swagger.path = '/cyberia-procedural-population/{id}'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('get')(req, res);
    });
    router.get(`/:id/impact`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'The impact of the targets'
        #swagger.description = 'Where each target runs now besides the map: other maps with their biome, a player, and the impact: local, shared or global.'
        #swagger.path = '/cyberia-procedural-population/{id}/impact'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('impact')(req, res);
    });
    router.post(`/:id/targets`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Add a target'
        #swagger.description = 'Adds { itemId, stage?, itemType?, cid? }: an existing item, a new item id with its stage (and its item type in the other stage), or the Object Layer definition authored by hand that cid names. A removed target is restored with its results. The item, its definitions and its binding do not change.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('addTarget')(req, res);
    });
    router.patch(`/:id/targets/:itemId`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Configure a target'
        #swagger.description = 'Sets { resolution?, templateId?, palette?, variation? } at any time. resolution is keep, render, template or author; one the item does not take now is refused with its reason. keep records the binding the item runs now and its revision; a later rebind is a conflict until it is kept again. A change of resolution takes the approval back from the selected entry. The entries, the authored definition and the binding stay; the next generation runs the configuration as it is.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}'
        #swagger.method = 'patch'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('updateTarget')(req, res);
    });
    router.delete(`/:id/targets/:itemId`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Remove a target from the population'
        #swagger.description = 'Removes the item from the population, from any source, with { reason? }: the active work of its runs is cancelled, its jobs and audit stay, and it stays removed until it is added again. No catalog entry, definition, binding or placement changes.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}'
        #swagger.method = 'delete'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('removeTarget')(req, res);
    });
    router.delete(`/:id/removed/:itemId`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Forget a removed target permanently'
        #swagger.description = 'Deletes the entry of the item in the removed list of this population, and nothing else: its definitions, CIDs, binding, placements, defaults, jobs and audit stay. An item the list does not hold changes nothing. A later read of the map may add the item again.'
        #swagger.path = '/cyberia-procedural-population/{id}/removed/{itemId}'
        #swagger.method = 'delete'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('forgetRemoved')(req, res);
    });
    router.post(`/:id/targets/:itemId/reset`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Reset the workflow of an item'
        #swagger.description = 'Resets the workflow of the item to a clean start: every generated result goes with its run and the revisions nothing else keeps, the selected one too; the item no longer uses its definition, each draft it stored goes when nothing else keeps it, and it takes the recommendation now with no palette choice and no variation. The next generation gives new results. Published definitions, bindings, placements, defaults, definitions another workflow stored and the audit stay. Answers the population with reset { removed, retained, failures, purged, remaining: { runs, drafts } }; running it again retries what failed.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/reset'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('resetTarget')(req, res);
    });
    router.get(`/:id/targets/:itemId/results`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'The results of an item'
        #swagger.description = 'Every generated result of the item, newest first, then each draft it stored and the definition it uses: source (render, template, author or stored), state, cid, render, what keeps it, and the actions use, edit, delete and retry, each with its availability and the reason when it is not available. Also how many results it keeps and the most it may keep.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/results'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('results')(req, res);
    });
    router.post(`/:id/targets/:itemId/results/delete`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Delete results of an item'
        #swagger.description = 'Deletes { ids }: each is a generated result (its run id) or the cid of a draft of the item. A generated result goes with its run, its candidate and every revision nothing else keeps; a draft goes when the item does not use it and nothing keeps it. The selected result, published content and what others use stay. Answers the population with deleted { removed, retained, failures, purged }; the audit records each delete.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/results/delete'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('deleteResults')(req, res);
    });
    router.get(`/:id/targets/:itemId/definitions`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Stored definitions of an item'
        #swagger.description = 'Paginated definitions of the item its results do not show, newest first: published ones and drafts another workflow stored. Each has its cid, status (active, published, draft or archived), the cid the item runs, hasRender, keptBy (what keeps it from a delete, empty when nothing), createdBy and updatedAt.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/definitions'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('targetDefinitions')(req, res);
    });
    router.post(`/:id/targets/:itemId/generate`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Generate results of an item'
        #swagger.description = 'Stores { count? } new runs of the item from its configuration as it is, 1 to 4, each under the seed of a run index of the population no other run took. Its results generate in the background. 409 when the item keeps the most results it may keep.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/generate'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('generate')(req, res);
    });
    router.post(`/:id/targets/:itemId/select`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Use a generated result'
        #swagger.description = 'Uses { entryId, cid }: a result of another start switches the resolution of the item to that start first; then it approves that exact revision and takes the approval back from the result selected before. Using the selected result again changes nothing.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/select'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('select')(req, res);
    });
    router.post(`/:id/targets/:itemId/entries/:entryId/retry`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Retry a failed result'
        #swagger.description = 'Runs a failed generated result again under its own seed: the same result, never a new one. 409 when a run under the same seed fails the same way.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/entries/{entryId}/retry'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('retryEntry')(req, res);
    });
    router.post(`/:id/palette/preview`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Preview a bulk palette change'
        #swagger.description = 'What { itemIds, source: palette or biome, paletteId?, overrides: keep or replace } gives each item: the palette before and after and each slot it changes or keeps. Stores nothing.'
        #swagger.path = '/cyberia-procedural-population/{id}/palette/preview'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('palette')(req, res);
    });
    router.post(`/:id/palette`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Apply a bulk palette change'
        #swagger.description = 'Applies the change the preview shows: each item takes its own palette; none is linked to another.'
        #swagger.path = '/cyberia-procedural-population/{id}/palette'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('palette')(req, res);
    });
    router.get(`/:id/draft`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'The placement draft'
        #swagger.description = 'The grid and placements of the draft, or of the map while it has none, the revisions they start from, the cid that draws each item, the items no cid draws with the reason, and the items of the population to place.'
        #swagger.path = '/cyberia-procedural-population/{id}/draft'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('draft')(req, res);
    });
    router.put(`/:id/draft`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Save the placement draft'
        #swagger.description = 'Saves { grid: { gridX, gridY, cellWidth, cellHeight }, entities, revision, baseRevision }. The live map does not change.'
        #swagger.path = '/cyberia-procedural-population/{id}/draft'
        #swagger.method = 'put'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('draft')(req, res);
    });
    router.delete(`/:id/draft`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Discard the placement draft'
        #swagger.description = 'The next composition starts from the map as it is.'
        #swagger.path = '/cyberia-procedural-population/{id}/draft'
        #swagger.method = 'delete'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('draft')(req, res);
    });
    router.post(`/:id/draft/rebase`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Rebase the draft'
        #swagger.description = 'Moves the draft onto { mapRevision } the moderator reviewed, at draft { revision }. The publication then replaces the grid and placements of that revision.'
        #swagger.path = '/cyberia-procedural-population/{id}/draft/rebase'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('rebase')(req, res);
    });
    router.get(`/:id/defaults`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'The entity-type defaults workspace'
        #swagger.description = 'The stored entity-type default rows whose live item ids name a staged item, and the rows added to the workspace: each with what it stores, the staged items it names, the instances that reference it (none: a global row every world runs) and the rows that run in its place. Also the staged items no row names, and the rows removed from the workspace. Needs no map, universe or instance.'
        #swagger.path = '/cyberia-procedural-population/{id}/defaults'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('defaults')(req, res);
    });
    router.post(`/:id/defaults`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Add a default to the workspace'
        #swagger.description = 'Adds the stored row { rowId } to the workspace, or brings back a row removed from it. The row does not change.'
        #swagger.path = '/cyberia-procedural-population/{id}/defaults'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('defaults')(req, res);
    });
    router.delete(`/:id/defaults/:rowId`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Remove a default from the workspace'
        #swagger.description = 'Removes the row from the workspace. The row, its live item ids and every other configuration stay.'
        #swagger.path = '/cyberia-procedural-population/{id}/defaults/{rowId}'
        #swagger.method = 'delete'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('defaults')(req, res);
    });
    router.post(`/:id/validate`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Validate a publication'
        #swagger.description = 'Runs the preflight with { acknowledged? }: ready, the problems that would stop it, and the plan. Stores nothing.'
        #swagger.path = '/cyberia-procedural-population/{id}/validate'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('validate')(req, res);
    });
    router.post(`/:id/publish`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Publish the population'
        #swagger.description = 'Starts the publication of { revision, acknowledged? }: revision is the population revision the moderator reviewed, and a population that changed since answers 409. The worker runs the preflight, publishes each revision, commits the bindings and the draft onto the same map in one transaction, then draws the map preview and refreshes the runtime. A request repeated while it runs starts nothing new.'
        #swagger.path = '/cyberia-procedural-population/{id}/publish'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('publish')(req, res);
    });
    router.post(`/:id/publication/retry`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Retry the publication'
        #swagger.description = 'Resumes the phase that failed: the preflight, the revisions left to publish, the commit, or the refresh of the runtime.'
        #swagger.path = '/cyberia-procedural-population/{id}/publication/retry'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('retryPublication')(req, res);
    });
    router.post(`/:id/publication/cancel`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Cancel the publication'
        #swagger.description = 'Cancels the publication before its commit. A revision it published stays published and unbound.'
        #swagger.path = '/cyberia-procedural-population/{id}/publication/cancel'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('cancelPublication')(req, res);
    });
    router.post(`/:id/cancel`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Cancel a population'
        #swagger.description = 'Stops the active work of the job of each target. Deletes nothing.'
        #swagger.path = '/cyberia-procedural-population/{id}/cancel'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('cancel')(req, res);
    });
    router.delete(`/:id`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Delete a population'
        #swagger.description = 'Deletes the population, the job of each target with what it left, and each draft its items stored that nothing else keeps. A publication keeps what it wrote; the audit stays.'
        #swagger.path = '/cyberia-procedural-population/{id}'
        #swagger.method = 'delete'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('delete')(req, res);
    });
    return router;
  }
}

const ApiRouter = (options) => CyberiaProceduralPopulationRouter.router(options);

export { ApiRouter, CyberiaProceduralPopulationRouter };
