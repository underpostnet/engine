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
    router.get(`/definitions`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Object Layer definitions for the target picker'
        #swagger.description = 'Paginated definitions, newest first: those of the item ?itemId=, or those whose item id holds ?q=. Each has its item id, item type, cid, status (active, published, draft, candidate or archived), the cid its item id runs, hasRender, keptBy (what keeps it from a delete, empty when nothing), createdBy and updatedAt.'
        #swagger.path = '/cyberia-procedural-population/definitions'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('definitions')(req, res);
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
        #swagger.description = 'Adds { itemId, stage?, itemType?, cid? }: an existing item, a new item id with its stage (and its item type in the other stage), or the Object Layer definition authored by hand that cid names. A removed target is restored with its runs. The item, its definitions and its binding do not change.'
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
        #swagger.description = 'Resets the workflow of the item to a clean start: a selected entry gives back its approval, its runs stop and leave the item, its authored definition is no longer used and goes when nothing else keeps it, and it takes the recommendation now with no palette choice and no variation. Published definitions, bindings, placements, defaults, jobs and audit stay. Answers the population with reset { removed, retained, failures }; running it again is safe.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/reset'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('resetTarget')(req, res);
    });
    router.delete(`/:id/targets/:itemId/drafts/:cid`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Delete a draft definition of an item'
        #swagger.description = 'Deletes a stored draft of the item that the item does not use and nothing else keeps: no binding, generated entry, map population or publication plan. 409 names what keeps it.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/drafts/{cid}'
        #swagger.method = 'delete'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('deleteDraft')(req, res);
    });
    router.post(`/:id/targets/:itemId/generate`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Generate entries of an item'
        #swagger.description = 'Stores { count? } new runs of the item from its configuration as it is, 1 to 4, each under the seed of its run. Its entries generate in the background.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/generate'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('generate')(req, res);
    });
    router.get(`/:id/targets/:itemId/entries`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'The entries of an item'
        #swagger.description = 'Every candidate of the runs of the item, newest first: its state (generating, ready, editing, selected, published, discarded, failed or cancelled), the CID it shows, its revision, template, palette, validation and diversity.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/entries'
        #swagger.method = 'get'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('entries')(req, res);
    });
    router.post(`/:id/targets/:itemId/select`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Select an entry'
        #swagger.description = 'Selects { entryId, cid }: approves that exact revision, then takes the approval back from the entry selected before.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/select'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('select')(req, res);
    });
    router.post(`/:id/targets/:itemId/entries/:entryId/discard`, ...guards, async (req, res) => {
      /*
        #swagger.auto = false
        #swagger.tags = ['cyberia-procedural-population']
        #swagger.summary = 'Discard an entry'
        #swagger.description = 'Rejects the current revision of the entry. It stays stored.'
        #swagger.path = '/cyberia-procedural-population/{id}/targets/{itemId}/entries/{entryId}/discard'
        #swagger.method = 'post'
        #swagger.produces = ['application/json']
        #swagger.security = [{
          'bearerAuth': []
        }]
      */
      return await handle('discardEntry')(req, res);
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
        #swagger.description = 'Deletes the population and the job of each target with what it left. A publication keeps what it wrote.'
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
