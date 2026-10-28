/**
 * CyberiaProceduralPopulation service: the map population API of the Procedural Engine. A moderator
 * reads a map context, creates a population, configures each item, generates or authors its results,
 * uses one and deletes the rest, reviews the entity-type defaults of its items, composes the map draft
 * in the Map Studio, validates, and publishes onto the same map in the background.
 *
 * @module src/api/cyberia-procedural-population/cyberia-procedural-population.service.js
 * @namespace CyberiaProceduralPopulationService
 */
import { DataQuery } from '../../server/storage/data-query.js';
import {
  listMapSummaries,
  populationModels,
  resolveMapContext,
} from '../../projects/cyberia/procedural/population/map-context.js';
import {
  discardDocumentDraft,
  draftMapPicture,
  draftWorldPicture,
  dropVariant,
  graphPortals,
  graphProblems,
  graphTopology,
  instanceDraftView,
  populationGraph,
  proposeVariant,
  rebaseDocumentDraft,
  runtimeContextOf,
  saveInstanceDraft,
  saveUniverseDraft,
  saveVariant,
  universeContent,
  universeDraftView,
} from '../../projects/cyberia/procedural/population/working-graph.js';
import { universeView } from '../cyberia-universe/cyberia-universe.service.js';
import {
  addTarget,
  applyPalette,
  cancelPopulation,
  createPopulation,
  deletePopulation,
  discardDraft,
  forgetRemoved,
  getDraft,
  getPopulation,
  listPopulations,
  populationImpact,
  previewPalette,
  rebaseDraft,
  removeTarget,
  saveDraft,
  updateTarget,
} from '../../projects/cyberia/procedural/population/population.js';
import {
  deleteResults,
  generateTarget,
  resetTarget,
  retryEntry,
  selectEntry,
  targetDefinitions,
  targetResults,
} from '../../projects/cyberia/procedural/population/results.js';
import {
  addDefault,
  defaultView,
  discardDefaultDraft,
  populationDefaults,
  removeDefault,
  saveDefault,
} from '../../projects/cyberia/procedural/population/defaults.js';
import {
  cancelPublication,
  requestPublication,
  retryPublication,
  validatePublication,
} from '../../projects/cyberia/procedural/population/publication.js';

const actorOf = (req) => String(req.auth.user._id);
const paged = (page, { data, total }) => ({ data, total, page: page.page, totalPages: Math.ceil(total / page.limit) });

class CyberiaProceduralPopulationService {
  /**
   * GET `/maps` (paginated): map summaries; `filterModel` and `sortModel` apply to the summary fields.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{data:Object[],total:number,page:number,totalPages:number}>}
   */
  static maps = async (req, res, options) => {
    const page = DataQuery.parse(req.query);
    return paged(page, await listMapSummaries(populationModels(options), page));
  };

  /**
   * GET `/maps/:code`: the map context a population reads now. Stores nothing.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static mapContext = async (req, res, options) => await resolveMapContext(populationModels(options), req.params.code);

  /**
   * POST `/`: creates a population, or answers the one equal inputs created.
   * @param {Object} req - Express request with body `{ mapCode, seed? }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static post = async (req, res, options) =>
    await createPopulation({ models: populationModels(options), request: req.body, actor: actorOf(req) });

  /**
   * GET `/` (paginated, newest first) or `/:id`: populations with their derived state.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const models = populationModels(options);
    if (req.params.id) return await getPopulation(models, req.params.id);
    const page = DataQuery.parse(req.query);
    return paged(page, await listPopulations(models, page));
  };

  /**
   * GET `/:id/impact`: where each target runs besides the map, and its impact.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object[]>}
   */
  static impact = async (req, res, options) => await populationImpact(populationModels(options), req.params.id);

  /**
   * GET `/:id/runtime-context`: where the map of the population runs now: its instances, their
   * universes and live servers. Writes nothing.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static runtimeContext = async (req, res, options) => {
    const models = populationModels(options);
    const graph = await populationGraph(models, req.params.id, options);
    return { ...(await runtimeContextOf(graph, options)), problems: await graphProblems(models, graph, options) };
  };

  /**
   * GET `/:id/instances/:code`: the instance as the working graph of the population holds it: the
   * document the Instance Studio edits, its state and revisions.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static instanceDraft = async (req, res, options) =>
    instanceDraftView(await populationGraph(populationModels(options), req.params.id, options), req.params.code);

  /**
   * PUT `/:id/instances/:code`: saves the draft of an instance in the population, `{ document, conf,
   * baseRevision, revision }`. The canonical instance changes only at the publication.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static saveInstanceDraft = async (req, res, options) =>
    await saveInstanceDraft({
      models: populationModels(options),
      id: req.params.id,
      code: req.params.code,
      body: req.body ?? {},
      actor: actorOf(req),
      options,
    });

  /**
   * DELETE `/:id/instances/:code` and `/:id/universes/:code`: discards a draft; the persisted document shows again.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{discarded:boolean}>}
   */
  static discardDocumentDraft = async (req, res, options) =>
    await discardDocumentDraft({
      models: populationModels(options),
      id: req.params.id,
      kind: req.path.includes('/universes/') ? 'universe' : 'instance',
      code: req.params.code,
      options,
    });

  /**
   * POST `/:id/instances/:code/rebase` and `/:id/universes/:code/rebase`: moves a draft onto the
   * revision its stored document is at now, keeping the fields it changed; `{ prefer: 'draft' }` keeps
   * the draft value of a field both changed.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static rebaseDocumentDraft = async (req, res, options) =>
    await rebaseDocumentDraft({
      models: populationModels(options),
      id: req.params.id,
      kind: req.path.includes('/universes/') ? 'universe' : 'instance',
      code: req.params.code,
      body: req.body ?? {},
      actor: actorOf(req),
      options,
    });

  /**
   * POST `/:id/instances/:code/variants`: proposes an instance-specific variant of the entity-type
   * default `{ rowId }` the instance references.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static proposeVariant = async (req, res, options) =>
    await proposeVariant({
      models: populationModels(options),
      id: req.params.id,
      code: req.params.code,
      rowId: req.body?.rowId,
      actor: actorOf(req),
      options,
    });

  /**
   * PUT `/:id/instances/:code/variants/:key`: saves the fields of a variant, `{ row, revision }`.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static saveVariant = async (req, res, options) =>
    await saveVariant({
      models: populationModels(options),
      id: req.params.id,
      code: req.params.code,
      key: req.params.key,
      body: req.body ?? {},
      actor: actorOf(req),
      options,
    });

  /**
   * DELETE `/:id/instances/:code/variants/:key`: drops a variant; the instance references the row it copies again.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static dropVariant = async (req, res, options) =>
    await dropVariant({
      models: populationModels(options),
      id: req.params.id,
      code: req.params.code,
      key: req.params.key,
      actor: actorOf(req),
      options,
    });

  /**
   * GET `/:id/universes/:code`: the universe as the working graph of the population holds it, with
   * each member as the Universe Studio shows it: a drafted member previews its draft world.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static universeDraft = async (req, res, options) => {
    const graph = await populationGraph(populationModels(options), req.params.id, options);
    const draft = universeDraftView(graph, req.params.code);
    const view = await universeView(
      { code: draft.code, ...graph.universes.get(draft.code), revision: draft.revision },
      options,
      universeContent(graph),
    );
    return {
      ...draft,
      view: {
        ...view,
        instances: view.instances.map((member, index) => ({ ...member, ...draft.members[index] })),
      },
    };
  };

  /**
   * PUT `/:id/universes/:code`: saves the draft of a universe in the population, `{ document,
   * baseRevision, revision }`. The canonical universe changes only at the publication.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static saveUniverseDraft = async (req, res, options) =>
    await saveUniverseDraft({
      models: populationModels(options),
      id: req.params.id,
      code: req.params.code,
      body: req.body ?? {},
      actor: actorOf(req),
      options,
    });

  /**
   * POST `/:id/topology`: what `{ mapCodes, portals }` connect in the working graph: the maps as the
   * population drafts them. Nothing is stored.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static topology = async (req, res, options) => {
    const { mapCodes, portals } = req.body ?? {};
    if (!Array.isArray(mapCodes) || !Array.isArray(portals))
      throw Object.assign(new Error('A topology names mapCodes and portals'), { status: 400 });
    return graphTopology(await populationGraph(populationModels(options), req.params.id, options), {
      mapCodes,
      portals,
    });
  };

  /**
   * GET `/:id/map-preview`: the picture of the map draft of the population.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Buffer|null>}
   */
  static mapPreview = async (req, res, options) =>
    await draftMapPicture(populationModels(options), req.params.id, options, req.query.revision);

  /**
   * GET `/:id/world-preview/:code`: the preview of the world of an instance as the working graph holds it.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Buffer>}
   */
  static worldPreview = async (req, res, options) =>
    await draftWorldPicture(populationModels(options), req.params.id, req.params.code, options, req.query.revision);

  /**
   * POST `/:id/portal-connect`: the portals the Portal Connector proposes for `{ mapCodes }`, with the
   * maps as the population drafts them. Nothing is stored.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static portalConnect = async (req, res, options) => {
    const { mapCodes } = req.body ?? {};
    if (!Array.isArray(mapCodes)) throw Object.assign(new Error('A portal connection names mapCodes'), { status: 400 });
    return graphPortals(await populationGraph(populationModels(options), req.params.id, options), mapCodes);
  };

  /**
   * `/:id/default-drafts[/:ref]`: GET reads a default as the Entity Studio of the population edits it (a
   * row id, a draft key, or `new`), POST saves its row and the instances that run it `{ rowId, key,
   * baseUpdatedAt, revision, row, instanceCodes, global, populationRevision }`, DELETE discards the draft
   * `ref` names. Stored defaults and confs change at the publication.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static defaultDrafts = async (req, res, options) => {
    const models = populationModels(options);
    const { id, ref } = req.params;
    if (req.method === 'GET') return await defaultView(models, id, ref, options);
    if (req.method === 'DELETE') return await discardDefaultDraft({ models, id, key: ref });
    return await saveDefault({ models, id, body: req.body ?? {}, actor: actorOf(req), options });
  };

  /**
   * POST `/:id/targets`: adds a target, `{ itemId, stage?, itemType?, cid? }`, or restores a removed one.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static addTarget = async (req, res, options) =>
    await addTarget({ models: populationModels(options), id: req.params.id, body: req.body, actor: actorOf(req) });

  /**
   * PATCH `/:id/targets/:itemId`: changes the resolution or the configuration of a target.
   * @param {Object} req - Express request with body `{ resolution?, templateId?, palette?, variation? }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static updateTarget = async (req, res, options) =>
    await updateTarget({
      models: populationModels(options),
      id: req.params.id,
      itemId: req.params.itemId,
      body: req.body,
      actor: actorOf(req),
    });

  /**
   * DELETE `/:id/targets/:itemId`: removes a target from the population; its runs stop and stay.
   * @param {Object} req - Express request with body `{ reason? }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static removeTarget = async (req, res, options) =>
    await removeTarget({
      models: populationModels(options),
      id: req.params.id,
      itemId: req.params.itemId,
      reason: req.body?.reason,
      actor: actorOf(req),
    });

  /**
   * POST `/:id/targets/:itemId/reset`: resets the workflow of a target to a clean start, and reports
   * what went, what stayed and what failed.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static resetTarget = async (req, res, options) =>
    await resetTarget({
      models: populationModels(options),
      id: req.params.id,
      itemId: req.params.itemId,
      actor: actorOf(req),
      options,
    });

  /**
   * DELETE `/:id/removed/:itemId`: forgets a removed target permanently; nothing else changes.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static forgetRemoved = async (req, res, options) =>
    await forgetRemoved({ models: populationModels(options), id: req.params.id, itemId: req.params.itemId });

  /**
   * POST `/:id/targets/:itemId/generate`: generates `{ count? }` new results from the configuration.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static generate = async (req, res, options) =>
    await generateTarget({
      models: populationModels(options),
      id: req.params.id,
      itemId: req.params.itemId,
      count: req.body?.count,
      actor: actorOf(req),
    });

  /**
   * GET `/:id/targets/:itemId/results`: the results of an item with the actions each takes, how many
   * it keeps and the most it may keep.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{results:Object[],retained:number,limit:number}>}
   */
  static results = async (req, res, options) =>
    await targetResults(populationModels(options), req.params.id, req.params.itemId);

  /**
   * POST `/:id/targets/:itemId/results/delete`: deletes the results `{ ids }` of an item, and reports
   * what went, what stayed and what failed.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static deleteResults = async (req, res, options) =>
    await deleteResults({
      models: populationModels(options),
      id: req.params.id,
      itemId: req.params.itemId,
      body: req.body,
      actor: actorOf(req),
      options,
    });

  /**
   * GET `/:id/targets/:itemId/definitions` (paginated): the stored definitions of the item its results
   * do not show.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{data:Object[],total:number,page:number,totalPages:number}>}
   */
  static targetDefinitions = async (req, res, options) => {
    const page = DataQuery.parse(req.query);
    return paged(page, await targetDefinitions(populationModels(options), req.params.id, req.params.itemId, page));
  };

  /**
   * POST `/:id/targets/:itemId/select`: uses the generated result `{ entryId, cid }` of an item.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static select = async (req, res, options) =>
    await selectEntry({
      models: populationModels(options),
      id: req.params.id,
      itemId: req.params.itemId,
      body: req.body,
      actor: actorOf(req),
    });

  /**
   * POST `/:id/targets/:itemId/entries/:entryId/retry`: runs a failed result again under its own seed.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static retryEntry = async (req, res, options) =>
    await retryEntry({
      models: populationModels(options),
      id: req.params.id,
      itemId: req.params.itemId,
      entryId: req.params.entryId,
      actor: actorOf(req),
    });

  /**
   * POST `/:id/palette/preview` and `/:id/palette`: what a bulk palette change does, and applying it.
   * @param {Object} req - Express request with body `{ itemIds, source, paletteId?, overrides }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static palette = async (req, res, options) => {
    const params = { models: populationModels(options), id: req.params.id, body: req.body };
    return req.path.endsWith('/preview') ? await previewPalette(params) : await applyPalette(params);
  };

  /**
   * GET, PUT or DELETE `/:id/draft`: the placement draft, with the CID that draws each item.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static draft = async (req, res, options) => {
    const models = populationModels(options);
    const { id } = req.params;
    if (req.method === 'PUT') return await saveDraft({ models, id, body: req.body, actor: actorOf(req) });
    if (req.method === 'DELETE') return await discardDraft(models, id);
    return await getDraft(models, id);
  };

  /**
   * POST `/:id/draft/rebase`: moves the draft onto the map revision the moderator reviewed.
   * @param {Object} req - Express request with body `{ mapRevision, revision }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static rebase = async (req, res, options) =>
    await rebaseDraft({ models: populationModels(options), id: req.params.id, body: req.body, actor: actorOf(req) });

  /**
   * GET `/:id/defaults`, POST `/:id/defaults` with `{ rowId }`, DELETE `/:id/defaults/:rowId`: the
   * entity-type defaults workspace, a row added to it, a row removed from it.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static defaults = async (req, res, options) => {
    const models = populationModels(options);
    const { id } = req.params;
    if (req.method === 'GET') return await populationDefaults(models, id);
    if (req.method === 'DELETE') return await removeDefault({ models, id, rowId: req.params.rowId });
    return await addDefault({ models, id, rowId: req.body?.rowId });
  };

  /**
   * POST `/:id/validate`: what a publication would do now, or why it would stop. Stores nothing.
   * @param {Object} req - Express request with body `{ acknowledged? }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{ready:boolean,problems:string[],plan:Object|null}>}
   */
  static validate = async (req, res, options) =>
    await validatePublication({ models: populationModels(options), id: req.params.id, body: req.body ?? {}, options });

  /**
   * POST `/:id/publish`: starts the publication of the population revision the moderator reviewed,
   * which the worker runs in phases. A request repeated while it runs starts nothing new.
   * @param {Object} req - Express request with body `{ revision, acknowledged? }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static publish = async (req, res, options) =>
    await requestPublication({
      models: populationModels(options),
      id: req.params.id,
      actor: actorOf(req),
      revision: req.body?.revision,
      acknowledged: req.body?.acknowledged ?? [],
    });

  /**
   * POST `/:id/publication/retry`: resumes the phase of the publication that failed.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static retryPublication = async (req, res, options) =>
    await retryPublication({ models: populationModels(options), id: req.params.id });

  /**
   * POST `/:id/publication/cancel`: cancels the publication before its commit.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static cancelPublication = async (req, res, options) =>
    await cancelPublication({ models: populationModels(options), id: req.params.id });

  /**
   * POST `/:id/cancel`: cancels a population.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static cancel = async (req, res, options) =>
    await cancelPopulation({ models: populationModels(options), id: req.params.id, actor: actorOf(req) });

  /**
   * DELETE `/:id`: deletes a population and the job of each target.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{jobs:number,stopped:number,candidates:number,drafts:number}>}
   */
  static delete = async (req, res, options) =>
    await deletePopulation({ models: populationModels(options), id: req.params.id, options });
}

export { CyberiaProceduralPopulationService };
