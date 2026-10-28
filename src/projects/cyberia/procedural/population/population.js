/**
 * Map population in the Procedural Engine: the items of one map, the entity-type defaults of those
 * items, the map draft, then one publication onto the same map. It orchestrates the item generation of the engine
 * and adds no second lifecycle.
 *
 * A population reads its map context once. Each target is one item id with its own configuration:
 * a resolution, a Genesis Template, a palette choice and a variation, which the moderator changes at
 * any time. `keep` records the binding the item runs, with its revision, and generates nothing;
 * `author` uses a definition a moderator authors by hand. A change of resolution takes the approval
 * back from the selected entry; the entries, the authored definition and the audit stay.
 * Each run of a target is a job that names the population, and its candidate is an entry of the
 * item: the results of an item live in {@link module:src/projects/cyberia/procedural/population/results.js}.
 * A moderator also adds a target, removes one from the population, restores it or forgets a removed
 * one. A removal cancels the active work of its runs and keeps them. None of these touches the item,
 * its definition, its binding or a placement.
 *
 * The draft is the map to publish: its grid and placements, from the map revision it read. The
 * preview draws every placed item by the CID it would run: its selected entry, its authored
 * definition, else its binding. Every state a client shows derives from what is stored here.
 *
 * @module src/projects/cyberia/procedural/population/population.js
 * @namespace CyberiaPopulation
 */
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { DataBaseProviderService } from '../../../../db/DataBaseProvider.js';
import { MongooseDB } from '../../../../db/mongo/MongooseDB.js';
import { CONTENT_PARTITION } from '../../content/content-release.js';
import {
  CLOSED_BEFORE_COMMIT,
  CyberiaProceduralPopulationDto,
  POPULATION_VERSION,
} from '../../../../api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { runsAnother } from '../../../../api/cyberia-item-catalog/cyberia-item-catalog.model.js';
import { ENTITY_TYPE_TO_ITEM_TYPES } from '../../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { renderedCids } from '../../catalog/object-layer-catalog.js';
import { deriveSeed } from '../core/seed.js';
import { cancelJob, deleteJob, purgeRevisions, requestError, revisionKeepers } from '../engine.js';
import { withdrawApproval } from '../jobs/review.js';
import { paletteOf } from '../palettes/catalog.js';
import { RANDOM_PALETTE, choiceOf, seedOf } from '../spec.js';
import { genesisTemplate, resolveTemplate } from '../templates.js';
import { workspaceOf } from './defaults.js';
import { observedOf, resolveMapContext, resolveTargets, targetUsage } from './map-context.js';
import { GENERATING, checkResolution, itemSupport, resolutionsOf } from './resolution.js';
import { STAGES, stageOf } from './stages.js';
import { themeSlots } from './theme.js';

/** The states of an item that are ready to publish. */
export const READY_STATES = Object.freeze(['selected', 'published', 'kept', 'authored']);
/** The states of an item that ask the moderator to act. */
const ATTENTION = Object.freeze(['failed', 'author', 'conflict']);
/** The state of an entry from the status of its candidate. */
const ENTRY_STATES = Object.freeze({
  queued: 'generating',
  running: 'generating',
  generated: 'generating',
  review: 'ready',
  editing: 'editing',
  approved: 'selected',
  promoted: 'published',
  rejected: 'discarded',
  failed: 'failed',
  cancelled: 'cancelled',
});
const REQUEST_KEYS = Object.freeze(['mapCode', 'seed']);
const TARGET_KEYS = Object.freeze(['resolution', 'templateId', 'palette', 'variation']);
const GRID_KEYS = Object.freeze(['gridX', 'gridY', 'cellWidth', 'cellHeight']);
/** The palette sources and override policies of a bulk palette change. */
const PALETTE_SOURCES = Object.freeze(['palette', 'biome']);
const PALETTE_OVERRIDES = Object.freeze(['keep', 'replace']);

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = (value) => createHash('sha256').update(canonicalize(value)).digest('hex');
/**
 * A request body that takes only some keys.
 * @param {Object} value
 * @param {string[]} keys
 * @param {string} name - What the body is, for the refusal.
 * @returns {Object} The body.
 * @throws {Error} 400 for a body that is not an object, or a key it does not take.
 * @memberof CyberiaPopulation
 */
export const only = (value, keys, name) => {
  if (!isPlain(value)) throw requestError(`${name} must be an object`);
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw requestError(`${name} does not take ${unknown.join(', ')}`);
  return value;
};

/**
 * A population request checked: the map code and the seed.
 * @param {Object} request - `{ mapCode, seed? }`.
 * @returns {{mapCode:string,seed:{mode:string,value:number}}}
 * @throws {Error} 400 on a key it does not take.
 * @memberof CyberiaPopulation
 */
export function checkPopulationRequest(request) {
  only(request, REQUEST_KEYS, 'A population request');
  if (typeof request.mapCode !== 'string' || !request.mapCode) throw requestError('A population names a mapCode');
  return { mapCode: request.mapCode, seed: seedOf(request.seed) };
}

/**
 * The job request of one run of a target: an update of its item from its render or its template, or
 * a new item with its id from its template when it has no artwork, in its palette and variation,
 * under the seed of the run.
 * @param {Object} target
 * @param {{rootSeed:number,fingerprint:string}} population
 * @param {number} run - The index of the run among the runs of the target.
 * @returns {Object} A generation request.
 * @memberof CyberiaPopulation
 */
export function targetRequest(target, { rootSeed, fingerprint }, run) {
  const { itemId, resolution, templateId, palette, variation } = target;
  const common = {
    generator: { id: stageOf(target.stage).generatorId },
    seed: { mode: 'fixed', value: deriveSeed(rootSeed, fingerprint, itemId, run) },
    ...(variation !== null && { variation: { level: variation } }),
  };
  const choice = { ...(palette.paletteId && { paletteId: palette.paletteId }), slots: palette.slots ?? {} };
  if (resolution === 'template' && !target.cid)
    return {
      mode: 'create-new',
      ...common,
      itemType: target.itemType,
      template: { id: templateId },
      palette: choice,
      output: { itemIds: [itemId] },
    };
  return {
    mode: 'update-existing',
    ...common,
    source: { itemIds: [itemId], fromTemplate: resolution === 'template' ? [itemId] : [] },
    template: { id: templateId },
    palette: { items: [{ itemId, ...choice }] },
    output: { variantsPerItem: 1 },
  };
}

/** Where the artwork of a run starts: `template` for a Genesis Template, else `render`. */
const runSource = (job) => (job.spec.mode === 'create-new' ? 'template' : (job.spec.sources[0]?.origin ?? 'render'));

/**
 * One entry of a target: the candidate of one of its runs, as a client shows it. A run that holds no
 * candidate record is `missing`.
 */
const entryOf = (job, item) => ({
  id: item ? String(item._id) : '',
  jobId: String(job._id),
  source: runSource(job),
  state: item ? ENTRY_STATES[item.status] : 'missing',
  cid: item?.candidateCid ?? '',
  revision: item?.revision ?? null,
  revisions: item?.revisions.length ?? 0,
  templateId: item?.templateId ?? '',
  paletteId: item?.paletteId ?? '',
  valid: item?.validation?.ok ?? false,
  problems: item?.validation?.problems ?? [],
  error: item ? (item.error?.message ?? '') : 'The run holds no candidate record',
  retryable: item?.error?.retryable ?? false,
  diversity: item?.diversity?.score ?? null,
  createdAt: item?.createdAt ?? job.createdAt,
  updatedAt: item?.updatedAt ?? job.createdAt,
});

/** The projection of a run that {@link entryOf} reads. */
const RUN_FIELDS = Object.freeze({
  populationId: 1,
  populationItemId: 1,
  createdAt: 1,
  'spec.mode': 1,
  'spec.sources.origin': 1,
});

/**
 * The runs of one target: every job of its population that generates its item, newest first.
 * @param {Object} models
 * @param {import('mongoose').Types.ObjectId} populationId
 * @param {string} itemId
 * @returns {Promise<Object[]>} Lean jobs.
 * @memberof CyberiaPopulation
 */
export const runsOf = async ({ CyberiaProceduralJob }, populationId, itemId) =>
  await CyberiaProceduralJob.find({ populationId, populationItemId: itemId }, RUN_FIELDS)
    .sort({ createdAt: -1, _id: -1 })
    .lean();

/**
 * The entries of each target of some populations, by population id and item id, newest first: one
 * for each run of the population that generates the item id.
 * @param {Object} models
 * @param {Object[]} populations
 * @returns {Promise<Map<string,Object[]>>} `<population id>|<item id>` → entries.
 * @memberof CyberiaPopulation
 */
export async function entriesOf({ CyberiaProceduralJob, CyberiaProceduralJobItem }, populations) {
  const jobs = await CyberiaProceduralJob.find({ populationId: { $in: populations.map(({ _id }) => _id) } }, RUN_FIELDS)
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const items = await CyberiaProceduralJobItem.find(
    { jobId: { $in: jobs.map(({ _id }) => _id) } },
    {
      jobId: 1,
      status: 1,
      candidateCid: 1,
      revision: 1,
      'revisions.cid': 1,
      templateId: 1,
      paletteId: 1,
      'validation.ok': 1,
      'validation.problems': 1,
      'error.message': 1,
      'error.retryable': 1,
      'diversity.score': 1,
      createdAt: 1,
      updatedAt: 1,
    },
  ).lean();
  const itemOf = new Map(items.map((item) => [String(item.jobId), item]));
  const entries = new Map();
  for (const job of jobs) {
    const key = `${job.populationId}|${job.populationItemId}`;
    if (!entries.has(key)) entries.set(key, []);
    entries.get(key).push(entryOf(job, itemOf.get(String(job._id))));
  }
  return entries;
}

/**
 * Whether the binding of a kept item is still the one the moderator observed.
 * @param {{cid:string,bindingRevision:number}} observed
 * @param {{cid:string,revision:number}|undefined} binding - Its binding now.
 * @returns {boolean}
 * @memberof CyberiaPopulation
 */
export const keeps = (observed, binding) =>
  Boolean(binding) && binding.cid === observed.cid && binding.revision === observed.bindingRevision;

/**
 * The state of an item: `kept` while its binding is the one observed, else `conflict`; `authored`
 * for a definition authored by hand, `author` until a moderator authors one; else from its
 * entries: `published`, `selected`, `generating`, `choose` while an entry waits for a choice,
 * `failed` when its newest entry failed, or `new` with nothing to choose.
 * @param {Object} target
 * @param {Object[]} entries - Its entries, newest first.
 * @param {{cid:string,revision:number}} [binding] - Its binding now.
 * @returns {string}
 * @memberof CyberiaPopulation
 */
export function targetState(target, entries, binding) {
  if (target.resolution === 'keep') return keeps(target.observed, binding) ? 'kept' : 'conflict';
  if (target.resolution === 'author') return target.definitionCid ? 'authored' : 'author';
  const states = entries.map(({ state }) => state);
  if (states.includes('published')) return 'published';
  if (states.includes('selected')) return 'selected';
  if (states.includes('generating')) return 'generating';
  if (states.includes('ready') || states.includes('editing')) return 'choose';
  return states[0] === 'failed' ? 'failed' : 'new';
}

/**
 * The live binding of each item of some populations.
 * @param {Object} models
 * @param {Object[]} populations
 * @returns {Promise<Map<string,{cid:string,revision:number}>>}
 */
const targetBindings = async (models, populations) =>
  await renderedBindings(
    models,
    populations.flatMap(({ targets }) => targets.map(({ itemId }) => itemId)),
  );

/** The binding of each item now, and whether its definition has render frames. Unbound items are absent. */
async function renderedBindings(models, itemIds) {
  const bindings = await models.CyberiaItemCatalog.bindingsOf(itemIds);
  const rendered = await renderedCids(
    models,
    [...bindings.values()].map(({ cid }) => cid),
  );
  return new Map(
    [...bindings].map(([itemId, binding]) => [itemId, { ...binding, hasRender: rendered.has(binding.cid) }]),
  );
}

/** The artwork of a binding: its definition when it has a render, else `unrendered`, which draws nothing. */
const boundArtwork = (binding, source) =>
  binding.hasRender ? { cid: binding.cid, source } : { cid: '', source: 'unrendered' };

/** The entries and the bindings the state of some populations reads. */
const workingState = async (models, populations) =>
  await Promise.all([entriesOf(models, populations), targetBindings(models, populations)]);

/**
 * The targets of a population with their state and artwork.
 * @param {Object} models
 * @param {Object} population - A lean population.
 * @returns {Promise<Object[]>}
 * @memberof CyberiaPopulation
 */
export const targetsOf = async (models, population) =>
  stateOf(population, ...(await workingState(models, [population]))).targets;

/**
 * The artwork an item shows, from its working state: a kept item shows its binding; an authored
 * item its authored definition; else its selected or published entry, its newest stored entry,
 * else the binding it runs now. `unrendered` when that binding has no render, `missing` when there is none.
 * @param {Object} target
 * @param {Object[]} entries - Its entries, newest first.
 * @param {Object|null} selected - Its selected or published entry.
 * @param {{cid:string,hasRender:boolean}|undefined} binding - Its binding now.
 * @returns {{cid:string,source:'kept'|'authored'|'selected'|'published'|'draft'|'bound'|'unrendered'|'missing'}}
 * @memberof CyberiaPopulation
 */
export function artworkOf(target, entries, selected, binding) {
  const bound = binding ? boundArtwork(binding, target.resolution === 'keep' ? 'kept' : 'bound') : null;
  if (target.resolution === 'keep') return bound ?? { cid: '', source: 'missing' };
  if (target.resolution === 'author')
    return target.definitionCid
      ? { cid: target.definitionCid, source: 'authored' }
      : (bound ?? { cid: '', source: 'missing' });
  if (selected) return { cid: selected.cid, source: selected.state };
  const draft = entries.find(({ state, cid }) => cid && (state === 'ready' || state === 'editing'));
  return draft ? { cid: draft.cid, source: 'draft' } : (bound ?? { cid: '', source: 'missing' });
}

/**
 * The state of each target, of each item group and of the population.
 * @param {Object} population - A lean population, or a list row of one.
 * @param {Map<string,Object[]>} entries - {@link entriesOf}.
 * @param {Map<string,Object>} bindings - {@link targetBindings}.
 * @returns {{targets:Object[],groups:Object[],status:string}}
 */
function stateOf(population, entries, bindings) {
  const bound = new Set((population.publication?.commit?.assets ?? []).map(({ itemId }) => itemId));
  const targets = population.targets.map((target) => {
    const own = entries.get(`${population._id}|${target.itemId}`) ?? [];
    const binding = bindings.get(target.itemId);
    const state = targetState(target, own, binding);
    const selected = own.find((entry) => entry.state === 'selected' || entry.state === 'published') ?? null;
    return {
      ...target,
      state: state === 'authored' && bound.has(target.itemId) ? 'published' : state,
      selected,
      latest: own[0] ?? null,
      binding: binding ?? null,
      artwork: artworkOf(target, own, selected, binding),
      counts: {
        entries: own.filter(({ state: entry }) => entry !== 'discarded' && entry !== 'cancelled').length,
        generating: own.filter(({ state: entry }) => entry === 'generating').length,
      },
    };
  });
  const groups = STAGES.map(({ id, name, order, itemTypes, generatorId, description }) => {
    const active = targets.filter((target) => target.stage === id);
    return {
      id,
      name,
      order,
      itemTypes,
      generates: Boolean(generatorId),
      description,
      items: active.length,
      ready: active.filter(({ state }) => READY_STATES.includes(state)).length,
    };
  });
  const { publication } = population;
  const status = population.cancelledAt
    ? 'cancelled'
    : publication?.commit
      ? 'published'
      : publication && !CLOSED_BEFORE_COMMIT.includes(publication.status)
        ? 'publishing'
        : 'open';
  return { targets, groups, status };
}

/** The state of the items step: what the moderator still decides on them. */
function itemsStep(active) {
  const ready = active.filter(({ state }) => READY_STATES.includes(state));
  const attention = active.filter(({ state }) => ATTENTION.includes(state));
  const detail = `${ready.length} of ${active.length} items ready`;
  if (active.length === 0) return { state: 'not-started', detail: 'No items yet: add one' };
  if (ready.length === active.length) return { state: 'ready', detail };
  if (attention.length > 0)
    return { state: 'attention', detail: `${detail} · ${attention.map(({ itemId }) => itemId).join(', ')} need you` };
  const started = active.some(({ counts, state }) => counts.entries > 0 || READY_STATES.includes(state));
  return { state: started ? 'in-progress' : 'not-started', detail };
}

/** The state of the defaults step: the rows of its workspace, and the staged items no row names, a warning only. */
function defaultsStep({ rows, missing }) {
  const unnamed = missing.length > 0 ? ` · no default names ${missing.map(({ itemId }) => itemId).join(', ')}` : '';
  return { state: 'ready', detail: `${rows.length} default${rows.length === 1 ? '' : 's'}${unnamed}` };
}

/** The state of the map step: whether a draft is saved, current and drawable, or the map revision it published. */
function mapStep(draft, map, { missing, problems }, publication) {
  if (publication?.commit?.map?.to === map.revision)
    return { state: 'published', detail: `Published as map revision ${map.revision}` };
  if (!draft) return { state: 'not-started', detail: 'No map changes: the map stays as it is' };
  const issues = [
    ...(draft.baseRevision !== map.revision
      ? [`map ${map.code} moved to revision ${map.revision}: review it and rebase the draft`]
      : []),
    ...missing.map(({ reason }) => reason),
    ...problems,
  ];
  if (issues.length > 0) return { state: 'attention', detail: issues.join('; ') };
  const { gridX, gridY } = draft.grid;
  return { state: 'ready', detail: `${gridX} × ${gridY} cells · ${draft.entities.length} placements` };
}

/**
 * The state of the optional runtime context step: the instances that list the map as the population
 * leaves them, with the instance and universe drafts it holds.
 */
async function contextStep(models, population) {
  const instances = population.instanceDrafts ?? [];
  const drafted = new Set(instances.map(({ code }) => code));
  const listing = new Set(
    (await models.CyberiaInstance.distinct('code', { cyberiaMapCodes: population.mapCode })).filter(
      (code) => !drafted.has(code),
    ),
  );
  for (const { code, document } of instances)
    if (document.cyberiaMapCodes.includes(population.mapCode)) listing.add(code);
  const drafts = instances.length + (population.universeDrafts ?? []).length;
  const pending = drafts > 0 ? ` · ${drafts} draft${drafts === 1 ? '' : 's'} saved to the population` : '';
  if (listing.size === 0)
    return {
      state: drafts > 0 ? 'ready' : 'optional',
      detail: `This map is not assigned to an instance or universe.${pending}`,
    };
  return { state: 'ready', detail: `Run by ${listing.size} instance${listing.size === 1 ? '' : 's'}${pending}` };
}

/** The state of the publish step, from its publication. */
function publishStep(publication) {
  if (!publication || publication.status === 'cancelled_before_commit')
    return { state: 'not-started', detail: 'Not published' };
  if (publication.status === 'completed') return { state: 'published', detail: 'Published and the runtime refreshed' };
  if (publication.status === 'published_reload_pending')
    return { state: 'attention', detail: 'Published; the runtime refresh waits' };
  if (publication.error) return { state: 'attention', detail: publication.error.message };
  return { state: 'in-progress', detail: `Publishing: ${publication.status.replaceAll('_', ' ')}` };
}

/**
 * What a client shows of a population: its map context, each target with its configuration, state,
 * selected and newest entry and impact, each item group, its draft summary, its entity-default
 * changes, its publication, and the state of each step derived from all of it. The draft entities
 * stay on the server.
 * @param {Object} models
 * @param {Object} population - A lean population.
 * @returns {Promise<Object>}
 * @memberof CyberiaPopulation
 */
export async function populationView(models, population) {
  const { draft, ...fields } = population;
  const state = stateOf(population, ...(await workingState(models, [population])));
  const [usage, map, defaults, support, context] = await Promise.all([
    targetUsage(
      models,
      state.targets.map(({ itemId }) => itemId),
      { mapCode: population.mapCode, biomeId: population.context.biome?.id ?? null },
    ),
    liveMap(models, population.mapCode),
    workspaceOf(models, population, state.targets),
    itemSupport(models),
    contextStep(models, population),
  ]);
  const drawn = draft ? await draftIssues(models, population, state.targets, draft.entities) : null;
  return {
    ...fields,
    ...state,
    targets: state.targets.map((target) => {
      const own = support[target.stage][target.itemType];
      return {
        ...target,
        resolutions: resolutionsOf(target, own),
        templates: own.usable,
        usage: usage.get(target.itemId),
      };
    }),
    draft: draft && {
      revision: draft.revision,
      baseRevision: draft.baseRevision,
      savedAt: draft.savedAt,
      grid: draft.grid,
      placements: draft.entities.length,
      missing: drawn.missing,
      problems: drawn.problems,
    },
    steps: {
      items: itemsStep(state.targets),
      defaults: defaultsStep(defaults),
      map: mapStep(draft, map, drawn ?? { missing: [], problems: [] }, population.publication),
      context,
      publish: publishStep(population.publication),
    },
  };
}

/**
 * A page of populations, newest first, each with its derived state; a record of another version is
 * `outdated`: read-only until the migration moves it, and a delete takes it.
 * @param {Object} models
 * @param {{query:Object,sort:Object,skip:number,limit:number}} page - A parsed data query.
 * @returns {Promise<{data:Object[],total:number}>}
 * @memberof CyberiaPopulation
 */
export async function listPopulations(models, { query, sort, skip, limit }) {
  const { CyberiaProceduralPopulation: Population } = models;
  const [rows, total] = await Promise.all([
    Population.find(query, CyberiaProceduralPopulationDto.select.list())
      .sort(Object.keys(sort).length > 0 ? sort : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Population.countDocuments(query),
  ]);
  const current = rows.filter(({ version }) => version === POPULATION_VERSION);
  const working = await workingState(models, current);
  return {
    data: rows.map((row) => {
      if (!current.includes(row)) return { ...row, groups: [], status: 'outdated' };
      const { groups, status } = stateOf(row, ...working);
      return { ...row, groups, status };
    }),
    total,
  };
}

/**
 * A lean population of this version.
 * @param {Object} models
 * @param {string} id
 * @returns {Promise<Object>}
 * @throws {Error} 404 for an unknown population; 409 for a record of another version.
 * @memberof CyberiaPopulation
 */
export async function findPopulation({ CyberiaProceduralPopulation }, id) {
  const population = /^[0-9a-f]{24}$/i.test(String(id)) && (await CyberiaProceduralPopulation.findById(id).lean());
  if (!population) throw requestError('Population not found', 404);
  if (population.version !== POPULATION_VERSION)
    throw requestError(
      `Population ${id} is a version ${population.version} record: run \`cyberia population migrate --apply\`, or delete it and start the map again`,
      409,
    );
  return population;
}

/**
 * Why a population takes no more changes: it was cancelled, or a publication runs or ran; empty
 * while it is open.
 * @param {Object} population
 * @returns {string}
 * @memberof CyberiaPopulation
 */
export function closedReason({ cancelledAt, publication }) {
  if (cancelledAt) return 'The population was cancelled';
  if (publication?.commit) return 'The population was published';
  if (publication && !CLOSED_BEFORE_COMMIT.includes(publication.status)) return heldReason(publication);
  return '';
}

/**
 * The condition a write of a population adds so it lands only while the population takes changes:
 * no cancel, and no publication that runs or ran.
 * @constant {Object}
 * @memberof CyberiaPopulation
 */
export const STILL_OPEN = Object.freeze({
  cancelledAt: null,
  $or: [{ publication: null }, { 'publication.status': { $in: CLOSED_BEFORE_COMMIT } }],
});

/**
 * A population that still takes changes: not cancelled, and with no publication that runs or ran.
 * @param {Object} models
 * @param {string} id
 * @returns {Promise<Object>}
 * @throws {Error} 404 for an unknown population; 409 for a closed one.
 * @memberof CyberiaPopulation
 */
export async function openPopulation(models, id) {
  const population = await findPopulation(models, id);
  const reason = closedReason(population);
  if (reason) throw requestError(reason, 409);
  return population;
}

/** Why a publication before its commit holds its population: it runs, or it stopped on a failure. */
const heldReason = ({ status }) =>
  status.endsWith('_failed')
    ? 'The publication of this population stopped on a failure: retry it, or cancel it before its commit'
    : 'A publication of this population runs: wait for it, or cancel it before its commit';

/**
 * Writes fields of a population that nobody changed since it was read, one revision more.
 * @param {Object} models
 * @param {Object} population - The population as read.
 * @param {Object} fields - The fields to set.
 * @returns {Promise<void>}
 * @throws {Error} 409 when the population changed meanwhile.
 * @memberof CyberiaPopulation
 */
export async function writePopulation({ CyberiaProceduralPopulation }, population, fields) {
  const written = await CyberiaProceduralPopulation.updateOne(
    { _id: population._id, updatedAt: population.updatedAt },
    { $set: fields, $inc: { revision: 1 } },
  );
  if (!written.matchedCount)
    throw requestError('The population changed meanwhile: review its current state and try again', 409);
}

/**
 * Writes the targets of a population that nobody changed since it was read.
 * @param {Object} models
 * @param {Object} population - The population as read.
 * @param {Object[]} targets
 * @returns {Promise<void>}
 * @throws {Error} 409 when the population changed meanwhile.
 * @memberof CyberiaPopulation
 */
export const writeTargets = (models, population, targets) => writePopulation(models, population, { targets });

/**
 * The target of an item id, with its index.
 * @param {Object} population
 * @param {string} itemId
 * @returns {{at:number,target:Object}}
 * @throws {Error} 404 when the population has no such target.
 * @memberof CyberiaPopulation
 */
export function targetOf(population, itemId) {
  const at = population.targets.findIndex((target) => target.itemId === itemId);
  if (at < 0) throw requestError(`The population has no item ${itemId}`, 404);
  return { at, target: population.targets[at] };
}

/**
 * The targets with one target replaced.
 * @param {Object} population
 * @param {number} at
 * @param {Object} target
 * @returns {Object[]}
 * @memberof CyberiaPopulation
 */
export const replaced = (population, at, target) =>
  population.targets.map((entry, index) => (index === at ? target : entry));

/**
 * Reads one population.
 * @param {Object} models
 * @param {string} id
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 404 for an unknown population.
 * @memberof CyberiaPopulation
 */
export const getPopulation = async (models, id) => await populationView(models, await findPopulation(models, id));

/**
 * Creates the population of a map, or returns the one equal inputs created. It reads and freezes the
 * map context, with a target for each item its composition and its placements name.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {Object} params.request - {@link checkPopulationRequest}.
 * @param {string} params.actor - User id of the moderator.
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 400 for an invalid request; 404 for an unknown map; 409 when the host serves no content.
 * @memberof CyberiaPopulation
 */
export async function createPopulation({ models, request, actor }) {
  const input = checkPopulationRequest(request);
  const { targets, ...context } = await resolveMapContext(models, input.mapCode);
  const blocker = context.findings.find(({ level, itemId }) => level === 'blocker' && !itemId);
  if (blocker) throw requestError(blocker.message, 409);
  const fingerprint = sha256({
    version: POPULATION_VERSION,
    map: { code: context.map.code, revision: context.map.revision },
    content: context.contentDigest,
    seed: input.seed.value,
  });
  const { CyberiaProceduralPopulation: Population } = models;
  const existing = await Population.findOne({ fingerprint }).lean();
  if (existing) return await populationView(models, existing);
  let population;
  try {
    population = (
      await Population.create({
        mapCode: input.mapCode,
        mapRevision: context.map.revision,
        fingerprint,
        rootSeed: input.seed.value,
        context,
        targets,
        createdBy: actor,
      })
    ).toObject();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    population = await Population.findOne({ fingerprint }).lean();
  }
  return await populationView(models, population);
}

/** The status of an Object Layer definition: `archived`, `draft` unpublished, else `published`. */
const definitionStatus = ({ archivedAt, origin }) =>
  archivedAt ? 'archived' : origin === 'draft' ? 'draft' : 'published';

/**
 * A page of the Object Layer definitions of an item id, newest first. Each has its item id, item
 * type, CID, status, whether it has a render, what keeps it from a delete ({@link revisionKeepers}),
 * who stored it and when.
 * @param {Object} models - {@link populationModels}.
 * @param {{itemId:string,exclude:string[],skip:number,limit:number}} params - `exclude` lists CIDs
 *   the page leaves out.
 * @returns {Promise<{data:Object[],total:number}>}
 * @memberof CyberiaPopulation
 */
export async function findDefinitions(models, { itemId, exclude, skip, limit }) {
  const query = { 'data.item.id': itemId, cid: { $nin: exclude } };
  const [definitions, total] = await Promise.all([
    models.ObjectLayer.find(query, { cid: 1, origin: 1, archivedAt: 1, createdBy: 1, updatedAt: 1, 'data.item': 1 })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.ObjectLayer.countDocuments(query),
  ]);
  const cids = definitions.map(({ cid }) => cid);
  const [rendered, keepers] = await Promise.all([renderedCids(models, cids), revisionKeepers(models, cids)]);
  return {
    data: definitions.map((definition) => ({
      cid: definition.cid,
      itemId: definition.data.item.id,
      itemType: definition.data.item.type,
      status: definitionStatus(definition),
      hasRender: rendered.has(definition.cid),
      keptBy: keepers.get(definition.cid) ?? '',
      createdBy: definition.createdBy ?? '',
      updatedAt: definition.updatedAt,
    })),
    total,
  };
}

/** A definition a target may use: of its item id, not archived, with a render, and no revision of a generated entry. */
async function selectableDefinition(models, itemId, cid) {
  const definition = await models.ObjectLayer.findOne(
    { cid },
    { cid: 1, origin: 1, archivedAt: 1, 'data.item': 1 },
  ).lean();
  if (!definition) throw requestError(`There is no Object Layer definition ${cid}`, 404);
  if (definition.data.item.id !== itemId)
    throw requestError(`Definition ${cid} is item ${definition.data.item.id}, not ${itemId}`);
  if (definition.archivedAt) throw requestError(`Definition ${cid} is archived`, 409);
  if (await models.CyberiaProceduralJobItem.exists({ 'revisions.cid': cid }))
    throw requestError(`Definition ${cid} is an entry of a generation: use it from the results of its item`, 409);
  if (!(await renderedCids(models, [cid])).has(cid))
    throw requestError(`Definition ${cid} has no render: continue editing it in the Studio, or choose another`, 409);
}

/**
 * Adds a target: an existing item, a new item id with its stage (and its item type in the `other`
 * stage), or an Object Layer definition authored by hand that the item id takes. A removed target
 * comes back as it was, with its entries. Adding a target the population holds with a definition makes
 * it the authored definition of the target, and takes back the approval of a selected entry.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id
 * @param {{itemId:string,stage?:string,itemType?:string,cid?:string}} params.body
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 400 for an item id no stage takes; 404 for an unknown definition; 409 for a closed
 *   population or a definition that cannot serve.
 * @memberof CyberiaPopulation
 */
export async function addTarget({ models, id, body, actor }) {
  const population = await openPopulation(models, id);
  const { itemId, stage, itemType, cid } = only(body, ['itemId', 'stage', 'itemType', 'cid'], 'An item');
  if (typeof itemId !== 'string' || !itemId) throw requestError('An item names an itemId');
  if (stage !== undefined) stageOf(stage);
  const back = population.removed.find(({ target }) => target.itemId === itemId)?.target;
  if (back) {
    await writePopulation(models, population, {
      targets: [...population.targets, back].sort((left, right) => (left.itemId < right.itemId ? -1 : 1)),
      removed: population.removed.filter(({ target }) => target.itemId !== itemId),
    });
    return cid ? await addTarget({ models, id, body, actor }) : await getPopulation(models, id);
  }
  const at = population.targets.findIndex((target) => target.itemId === itemId);
  const existing = population.targets[at];
  if (existing && (!cid || (existing.resolution === 'author' && existing.definitionCid === cid)))
    return await populationView(models, population);
  if (cid !== undefined) {
    if (typeof cid !== 'string' || !cid) throw requestError('cid names an Object Layer definition');
    await selectableDefinition(models, itemId, cid);
  }
  const {
    targets: [resolved],
  } = await resolveTargets(models, [
    {
      itemId,
      stage: stage ?? existing?.stage,
      itemType: itemType ?? existing?.itemType,
      entityTypes: new Set(),
      sources: new Set([...(existing?.sources ?? []), 'manual']),
      foundation: existing?.foundation,
      placements: existing?.placements,
      definitionCid: cid ?? existing?.definitionCid ?? '',
    },
  ]);
  if (!existing) {
    await writeTargets(models, population, [...population.targets, resolved]);
    return await getPopulation(models, id);
  }
  await withdrawSelection(models, population, existing, { to: 'author', actor });
  const target = {
    ...existing,
    sources: resolved.sources,
    definitionCid: resolved.definitionCid,
    resolution: 'author',
    observed: null,
  };
  await writeTargets(models, population, replaced(population, at, target));
  return await getPopulation(models, id);
}

/**
 * What a target keeps: the binding its item runs now and its revision, read again with its render.
 * @throws {Error} 400 when the item runs no definition.
 */
async function keptTarget(models, target) {
  const binding = (await models.CyberiaItemCatalog.bindingsOf([target.itemId])).get(target.itemId);
  if (!binding) throw requestError(`${target.itemId} runs no definition: there is no artwork to keep`);
  const hasRender = (await renderedCids(models, [binding.cid])).has(binding.cid);
  return { ...target, resolution: 'keep', cid: binding.cid, hasRender, observed: observedOf(binding) };
}

/**
 * A target with its binding now, and what its stage supports for its item type.
 * @param {Object} models
 * @param {Object} target
 * @returns {Promise<{own:Object,current:Object}>} `own` is the {@link itemSupport} of its stage and type.
 * @memberof CyberiaPopulation
 */
export async function capabilitiesNow(models, target) {
  const [support, bindings] = await Promise.all([
    itemSupport(models),
    models.CyberiaItemCatalog.bindingsOf([target.itemId]),
  ]);
  return {
    own: support[target.stage][target.itemType],
    current: { ...target, binding: bindings.get(target.itemId) ?? null },
  };
}

/**
 * Takes the approval back from the selected entry of a target that leaves its resolution. The entry
 * stays, ready for a later choice, and its audit names the change.
 */
async function withdrawSelection(models, population, target, { to, actor }) {
  if (target.resolution === to) return;
  const entries = (await entriesOf(models, [population])).get(`${population._id}|${target.itemId}`) ?? [];
  for (const entry of entries.filter(({ state }) => state === 'selected'))
    await withdrawApproval({
      models,
      jobId: entry.jobId,
      id: entry.id,
      actor,
      reason: `the resolution of ${target.itemId} changed to ${to}`,
    });
}

/**
 * A target in a resolution: `keep` records the binding of this moment; any other drops a kept
 * binding. Leaving a resolution takes the approval back from the selected entry.
 * @param {Object} models
 * @param {Object} population
 * @param {Object} target
 * @param {string} resolution
 * @param {string} actor
 * @returns {Promise<Object>} The target to write.
 * @memberof CyberiaPopulation
 */
export async function resolvedTarget(models, population, target, resolution, actor) {
  await withdrawSelection(models, population, target, { to: resolution, actor });
  return resolution === 'keep' ? await keptTarget(models, target) : { ...target, resolution, observed: null };
}

/**
 * Changes the resolution or the configuration of a target. A resolution the target does not take
 * now is refused with its reason. `keep` records the binding the item runs now, at its revision; a
 * later rebind shows as a conflict, and keeping again records the binding of that moment. Leaving a
 * resolution takes the approval back from the selected entry. The entries, the authored definition
 * and the binding stay. The next Generate runs the configuration as it is.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {{resolution?:string,templateId?:string,palette?:Object,variation?:number|null}} params.body
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 400 for a value the target does not take; 404 for an unknown target; 409 for a closed population.
 * @memberof CyberiaPopulation
 */
export async function updateTarget({ models, id, itemId, body, actor }) {
  const population = await openPopulation(models, id);
  only(body, TARGET_KEYS, 'An item change');
  const { at, target } = targetOf(population, itemId);
  const { own, current } = await capabilitiesNow(models, target);
  let next = { ...target };
  if (body.templateId !== undefined) {
    if (!own.usable.includes(body.templateId))
      throw requestError(`${itemId} takes the template ${own.usable.join(', ') || 'none'}, not ${body.templateId}`);
    next.templateId = body.templateId;
  }
  if (body.palette !== undefined) {
    const palette = choiceOf(body.palette, 'palette');
    if (palette.paletteId && palette.paletteId !== RANDOM_PALETTE)
      try {
        paletteOf(palette.paletteId);
      } catch (error) {
        throw requestError(error.message);
      }
    next.palette = palette;
  }
  if (body.variation !== undefined) {
    if (body.variation !== null && !(Number.isFinite(body.variation) && body.variation >= 0 && body.variation <= 1))
      throw requestError('variation is null or a number from 0 to 1');
    next.variation = body.variation;
  }
  if (body.resolution !== undefined) {
    checkResolution(itemId, current, own, body.resolution);
    next = await resolvedTarget(models, population, next, body.resolution, actor);
  }
  await writeTargets(models, population, replaced(population, at, next));
  return await getPopulation(models, id);
}

/**
 * Removes a target from the population, from any source. The active work of its runs is cancelled;
 * its jobs, entries and audit stay. The removed target keeps who removed it, when and why, and stays
 * removed until a moderator adds it back. The item, its definitions, its binding, its placements and
 * the catalog stay.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.itemId
 * @param {string} [params.reason]
 * @param {string} params.actor
 * @param {Date} [params.now]
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 404 for an unknown target; 409 for a closed population.
 * @memberof CyberiaPopulation
 */
export async function removeTarget({ models, id, itemId, reason = '', actor, now = new Date() }) {
  const population = await openPopulation(models, id);
  const { at, target } = targetOf(population, itemId);
  for (const { _id } of await runsOf(models, population._id, itemId))
    await stopJob(models, _id, { actor, reason: `${itemId} removed from the population`, now });
  await writePopulation(models, population, {
    targets: population.targets.filter((_, index) => index !== at),
    removed: [...population.removed, { target, by: actor, at: now, reason: String(reason) }],
  });
  return await getPopulation(models, id);
}

/**
 * Forgets a removed target permanently: its entry in the removed list goes, and nothing else. The
 * item, its definitions, its CIDs, its binding, its placements, the defaults, its jobs and their
 * audit stay. A later read of the map may name the item again. An item the list does not hold
 * changes nothing.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.itemId
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 404 for an unknown population; 409 for a closed population.
 * @memberof CyberiaPopulation
 */
export async function forgetRemoved({ models, id, itemId }) {
  const population = await openPopulation(models, id);
  const removed = population.removed.filter(({ target }) => target.itemId !== itemId);
  if (removed.length < population.removed.length) await writePopulation(models, population, { removed });
  return await getPopulation(models, id);
}

/**
 * Cancels the active work of a job; a job with none left, or gone, is fine. Its candidates and its
 * audit stay.
 * @param {Object} models
 * @param {import('mongoose').Types.ObjectId|string} jobId
 * @param {{actor:string,reason:string,now:Date}} cancel
 * @returns {Promise<void>}
 * @memberof CyberiaPopulation
 */
export async function stopJob(models, jobId, { actor, reason, now }) {
  try {
    await cancelJob({ models, jobId, actor, reason, now });
  } catch (error) {
    if (error.status !== 404 && error.status !== 409) throw error;
  }
}

/**
 * The palette a bulk change gives some items, and the slots it changes. The source is a Palette
 * Template (`paletteId`) or the biome colors of the map; `keep` keeps the slots an item sets over
 * the source, `replace` drops them. Pure: a preview and an apply read the same changes.
 * @param {Object} population
 * @param {{itemIds:string[],source:string,paletteId?:string,overrides:string}} body
 * @returns {{changes:Object[],skipped:Array<{itemId:string,reason:string}>}} Each change names its
 *   item, the palette before and after, and each slot that differs or that the item keeps.
 * @throws {Error} 400 for a body the change does not take.
 * @memberof CyberiaPopulation
 */
export function paletteChanges(population, body) {
  const { itemIds, source, paletteId, overrides } = only(
    body,
    ['itemIds', 'source', 'paletteId', 'overrides'],
    'A palette change',
  );
  if (!Array.isArray(itemIds) || itemIds.length === 0) throw requestError('itemIds lists the items to change');
  if (!PALETTE_SOURCES.includes(source)) throw requestError(`source is one of ${PALETTE_SOURCES.join(', ')}`);
  if (!PALETTE_OVERRIDES.includes(overrides)) throw requestError(`overrides is one of ${PALETTE_OVERRIDES.join(', ')}`);
  if (source === 'palette')
    try {
      paletteOf(paletteId);
    } catch {
      throw requestError('A palette source names the paletteId of a palette of the library');
    }
  if (source === 'biome' && population.context.palettes.length === 0) throw requestError('The map has no biome colors');
  const changes = [];
  const skipped = [];
  const offsets = new Map();
  for (const target of population.targets.filter(({ itemId }) => itemIds.includes(itemId))) {
    const { itemId } = target;
    if (!GENERATING.includes(target.resolution)) {
      skipped.push({ itemId, reason: 'it generates no artwork' });
      continue;
    }
    const template = resolveTemplate(genesisTemplate(target.templateId));
    const own = target.palette.slots ?? {};
    let after;
    if (source === 'palette') after = { paletteId, slots: overrides === 'keep' ? { ...own } : {} };
    else {
      const offset = stageOf(target.stage).rotatesTheme ? (offsets.get(target.stage) ?? 0) : 0;
      offsets.set(target.stage, offset + 1);
      const slots = themeSlots(template, { palettes: population.context.palettes, offset });
      after = { slots: overrides === 'keep' ? { ...slots, ...own } : slots };
    }
    const keys = [...new Set([...Object.keys(own), ...Object.keys(after.slots)])].sort();
    changes.push({
      itemId,
      before: { ...(target.palette.paletteId && { paletteId: target.palette.paletteId }), slots: { ...own } },
      after,
      slots: keys
        .map((slot) => ({
          slot,
          before: own[slot] ?? null,
          after: after.slots[slot] ?? null,
          kept: overrides === 'keep' && slot in own,
        }))
        .filter(({ before, after: next, kept }) => kept || before !== next),
    });
  }
  for (const itemId of itemIds.filter((entry) => !population.targets.some((target) => target.itemId === entry)))
    skipped.push({ itemId, reason: 'the population has no such item' });
  return { changes, skipped };
}

/**
 * What a bulk palette change would do, with nothing stored.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {Object} params.body - {@link paletteChanges}.
 * @returns {Promise<Object>} {@link paletteChanges}.
 * @memberof CyberiaPopulation
 */
export async function previewPalette({ models, id, body }) {
  return paletteChanges(await openPopulation(models, id), body);
}

/**
 * Applies a bulk palette change: each item takes its own palette, and none is linked to another.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {Object} params.body - {@link paletteChanges}.
 * @returns {Promise<Object>} {@link populationView} with the `applied` changes.
 * @throws {Error} 400 for a change that applies to no item; 409 for a closed population.
 * @memberof CyberiaPopulation
 */
export async function applyPalette({ models, id, body }) {
  const population = await openPopulation(models, id);
  const { changes, skipped } = paletteChanges(population, body);
  if (changes.length === 0)
    throw requestError(
      `No item takes this palette: ${skipped.map(({ itemId, reason }) => `${itemId}: ${reason}`).join('; ')}`,
    );
  const after = new Map(changes.map(({ itemId, after: palette }) => [itemId, palette]));
  await writeTargets(
    models,
    population,
    population.targets.map((target) =>
      after.has(target.itemId) ? { ...target, palette: after.get(target.itemId) } : target,
    ),
  );
  return { ...(await getPopulation(models, id)), applied: { changes, skipped } };
}

/**
 * Where each target of a population runs now besides its map, and its impact.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id
 * @returns {Promise<Array<{stage:string,itemId:string,maps:Object[],players:boolean,impact:string}>>}
 * @throws {Error} 404 for an unknown population.
 * @memberof CyberiaPopulation
 */
export async function populationImpact(models, id) {
  const population = await findPopulation(models, id);
  const usage = await targetUsage(
    models,
    population.targets.map(({ itemId }) => itemId),
    { mapCode: population.mapCode, biomeId: population.context.biome?.id ?? null },
  );
  return population.targets.map(({ stage, itemId }) => ({ stage, itemId, ...usage.get(itemId) }));
}

/**
 * The live map of a population: its document id, revision, grid, placements, media and preview.
 * @param {Object} models
 * @param {string} code
 * @returns {Promise<Object>}
 * @throws {Error} 404 for an unknown map.
 * @memberof CyberiaPopulation
 */
export async function liveMap({ CyberiaMap }, code) {
  const map = await CyberiaMap.findOne(
    { code },
    {
      code: 1,
      revision: 1,
      gridX: 1,
      gridY: 1,
      cellWidth: 1,
      cellHeight: 1,
      entities: 1,
      media: 1,
      preview: 1,
      thumbnail: 1,
    },
  ).lean();
  if (!map) throw requestError(`Map ${code} not found`, 404);
  return map;
}

const placementsOf = (entities) => entities.map(({ _id, ...entity }) => entity);
const gridOf = (map) => Object.fromEntries(GRID_KEYS.map((key) => [key, map[key]]));

/**
 * The artwork of item ids, the one source of every preview: a staged item shows its artwork
 * ({@link artworkOf}); another item shows the definition the catalog binds when it has a render,
 * with its item type.
 * @param {Object} models
 * @param {Object[]} targets - The targets of {@link targetsOf}.
 * @param {string[]} itemIds
 * @returns {Promise<Map<string,{itemType:string,cid:string,source:string}>>}
 * @memberof CyberiaPopulation
 */
export async function itemArtwork(models, targets, itemIds) {
  const staged = new Map(targets.map((target) => [target.itemId, target]));
  const bindings = await renderedBindings(
    models,
    itemIds.filter((itemId) => !staged.has(itemId)),
  );
  const definitions = await models.ObjectLayer.find(
    { cid: { $in: [...bindings.values()].map(({ cid }) => cid) } },
    { cid: 1, 'data.item.type': 1 },
  ).lean();
  const types = new Map(definitions.map(({ cid, data }) => [cid, data.item.type]));
  return new Map(
    itemIds.map((itemId) => {
      const target = staged.get(itemId);
      if (target) return [itemId, { itemType: target.itemType, ...target.artwork }];
      const binding = bindings.get(itemId);
      if (!binding) return [itemId, { itemType: '', cid: '', source: 'missing' }];
      return [itemId, { itemType: types.get(binding.cid) ?? '', ...boundArtwork(binding, 'bound') }];
    }),
  );
}

/**
 * The CID that draws each item in a map preview ({@link itemArtwork}), and the items none draws,
 * with the reason.
 * @param {Object} models
 * @param {Object[]} targets - The targets of {@link targetsOf}.
 * @param {string[]} itemIds
 * @returns {Promise<{previewKeys:Object<string,string>,missing:Array<{itemId:string,reason:string}>}>}
 * @memberof CyberiaPopulation
 */
export async function previewOf(models, targets, itemIds) {
  const staged = new Set(targets.map(({ itemId }) => itemId));
  const previewKeys = {};
  const missing = [];
  for (const [itemId, { cid, source }] of await itemArtwork(models, targets, itemIds)) {
    if (cid) {
      previewKeys[itemId] = cid;
      continue;
    }
    const remedy = staged.has(itemId)
      ? 'generate entries, or author it in the Object Layer Studio'
      : 'add it as an item to give it artwork';
    missing.push({
      itemId,
      reason:
        source === 'unrendered'
          ? `${itemId} runs a definition with no render: ${remedy}`
          : staged.has(itemId)
            ? `${itemId} has no artwork yet: ${remedy}`
            : `No definition is bound to ${itemId}: add it as an item, or bind it in the catalog`,
    });
  }
  return { previewKeys, missing };
}

/** What stops the placements of a draft from drawing or running: missing artwork and refused items. */
async function draftIssues(models, population, targets, entities) {
  const itemIds = [...new Set(entities.flatMap(({ objectLayerItemIds }) => objectLayerItemIds))];
  const { missing } = await previewOf(models, targets, itemIds);
  const incoming = new Map(targets.map(({ itemId, itemType }) => [itemId, itemType]));
  return { missing, problems: await draftProblems(models, entities, incoming) };
}

/**
 * What the Map Studio and the review compose a population with: the grid and placements of its
 * draft, or of the map while it has none, the revisions they start from, when the draft was saved,
 * the media, preview and custom thumbnail of the live map, the CID that draws each placed item and
 * each item of the population, the items no CID draws, and the items the Studio can place.
 * @param {Object} models
 * @param {string} id
 * @returns {Promise<Object>}
 * @throws {Error} 404 for an unknown population.
 * @memberof CyberiaPopulation
 */
export async function getDraft(models, id) {
  const population = await findPopulation(models, id);
  const [map, targets] = await Promise.all([liveMap(models, population.mapCode), targetsOf(models, population)]);
  const entities = population.draft?.entities ?? placementsOf(map.entities);
  const items = targets.map(({ itemId, itemType, state }) => ({ itemId, itemType, state }));
  const itemIds = [
    ...new Set([
      ...entities.flatMap(({ objectLayerItemIds }) => objectLayerItemIds),
      ...items.map(({ itemId }) => itemId),
    ]),
  ];
  return {
    mapId: String(map._id),
    mapCode: map.code,
    mapRevision: map.revision,
    media: map.media ?? null,
    preview: map.preview ? String(map.preview) : null,
    thumbnail: map.thumbnail ? String(map.thumbnail) : null,
    baseRevision: population.draft?.baseRevision ?? map.revision,
    revision: population.draft?.revision ?? 0,
    savedAt: population.draft?.savedAt ?? null,
    grid: population.draft?.grid ?? gridOf(map),
    entities,
    ...(await previewOf(models, targets, itemIds)),
    items,
  };
}

/** A grid checked: positive integers for the cells across and down and the pixels of a cell. */
function checkGrid(grid) {
  only(grid, GRID_KEYS, 'A grid');
  for (const key of GRID_KEYS)
    if (!Number.isInteger(grid[key]) || grid[key] < 1) throw requestError(`grid.${key} is a positive integer`);
  return gridOf(grid);
}

/**
 * Saves the draft: the grid and the placements. The first save starts the draft from the map
 * revision the Studio read; a later save names the draft revision it read, so no save overwrites a
 * newer one.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {{grid:Object,entities:Object[],revision:number,baseRevision:number}} params.body
 * @param {string} params.actor
 * @returns {Promise<{revision:number,baseRevision:number,grid:Object,placements:number,savedAt:Date}>}
 * @throws {Error} 400 for a grid or placements the map schema refuses; 409 for a closed population,
 *   a newer draft, or a map that changed before the first save.
 * @memberof CyberiaPopulation
 */
export async function saveDraft({ models, id, body, actor }) {
  const population = await openPopulation(models, id);
  only(body, ['grid', 'entities', 'revision', 'baseRevision'], 'A draft');
  if (!Array.isArray(body.entities)) throw requestError('A draft holds entities');
  const grid = checkGrid(body.grid);
  const map = await liveMap(models, population.mapCode);
  const { draft } = population;
  if ((draft?.revision ?? 0) !== body.revision)
    throw requestError(`The draft is at revision ${draft?.revision ?? 0}, not ${body.revision}: reload it`, 409);
  const baseRevision = draft?.baseRevision ?? body.baseRevision;
  if (!draft && baseRevision !== map.revision)
    throw requestError(`Map ${map.code} is at revision ${map.revision}, not ${baseRevision}: reload it`, 409);
  const outside = body.entities.find(
    ({ initCellX, initCellY }) => initCellX < 0 || initCellY < 0 || initCellX >= grid.gridX || initCellY >= grid.gridY,
  );
  if (outside)
    throw requestError(
      `An entity starts at (${outside.initCellX}, ${outside.initCellY}), outside the ${grid.gridX} × ${grid.gridY} grid: move it or keep the grid larger`,
    );
  const checked = new models.CyberiaMap({ ...map, ...grid, entities: placementsOf(body.entities) });
  try {
    await checked.validate();
  } catch (error) {
    throw requestError(error.message);
  }
  const next = {
    grid,
    entities: checked.entities.map((entity) => placementsOf([entity.toObject()])[0]),
    baseRevision,
    revision: (draft?.revision ?? 0) + 1,
    savedAt: new Date(),
    savedBy: actor,
  };
  const saved = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, 'draft.revision': draft ? draft.revision : { $exists: false }, ...STILL_OPEN },
    { $set: { draft: next }, $inc: { revision: 1 } },
  );
  if (!saved.matchedCount) throw requestError('The draft changed while saving: reload it', 409);
  return {
    revision: next.revision,
    baseRevision,
    grid,
    placements: next.entities.length,
    savedAt: next.savedAt,
  };
}

/**
 * Discards the draft: the next composition starts from the map as it is.
 * @param {Object} models
 * @param {string} id
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 404 for an unknown population; 409 for a closed one.
 * @memberof CyberiaPopulation
 */
export async function discardDraft(models, id) {
  const population = await openPopulation(models, id);
  await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id },
    { $set: { draft: null }, $inc: { revision: 1 } },
  );
  return await getPopulation(models, id);
}

/**
 * Moves the draft onto the revision the map is at now, when the moderator decides it: the draft keeps
 * its grid and placements, and the publication replaces those of that revision. It names the map
 * revision the moderator reviewed, so a later change of the map asks again.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {{mapRevision:number,revision:number}} params.body - The map revision reviewed and the draft revision read.
 * @param {string} params.actor
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 409 for a closed population, no draft, or a revision that is not the current one.
 * @memberof CyberiaPopulation
 */
export async function rebaseDraft({ models, id, body, actor }) {
  const population = await openPopulation(models, id);
  only(body, ['mapRevision', 'revision'], 'A rebase');
  const { draft } = population;
  if (!draft) throw requestError('There is no draft to rebase', 409);
  if (draft.revision !== body.revision)
    throw requestError(`The draft is at revision ${draft.revision}, not ${body.revision}: reload it`, 409);
  const map = await liveMap(models, population.mapCode);
  if (map.revision !== body.mapRevision)
    throw requestError(`Map ${map.code} is at revision ${map.revision}, not ${body.mapRevision}: review it again`, 409);
  const saved = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, 'draft.revision': draft.revision },
    {
      $set: {
        'draft.baseRevision': map.revision,
        'draft.revision': draft.revision + 1,
        'draft.savedAt': new Date(),
        'draft.savedBy': actor,
      },
      $inc: { revision: 1 },
    },
  );
  if (!saved.matchedCount) throw requestError('The draft changed while rebasing: reload it', 409);
  return await getPopulation(models, id);
}

/**
 * Why some placements cannot run: item ids nothing binds, selects or creates, and items an entity
 * type does not take.
 * @param {Object} models
 * @param {Object[]} entities
 * @param {Map<string,string>} incoming - Item id → item type of each item the publication binds.
 * @returns {Promise<string[]>}
 * @memberof CyberiaPopulation
 */
export async function draftProblems(models, entities, incoming) {
  const ids = [...new Set(entities.flatMap(({ objectLayerItemIds }) => objectLayerItemIds))];
  const bindings = await models.CyberiaItemCatalog.resolve(ids);
  const definitions = await models.ObjectLayer.find(
    { cid: { $in: [...bindings.values()] } },
    { cid: 1, 'data.item.type': 1 },
  ).lean();
  const typeOf = new Map(definitions.map(({ cid, data }) => [cid, data.item.type]));
  const problems = new Set();
  for (const { entityType, objectLayerItemIds } of entities)
    for (const itemId of objectLayerItemIds) {
      const type = incoming.get(itemId) ?? (bindings.has(itemId) ? typeOf.get(bindings.get(itemId)) : undefined);
      if (!type) problems.add(`${itemId} is not a Cyberia item here`);
      else if (!ENTITY_TYPE_TO_ITEM_TYPES[entityType]?.includes(type))
        problems.add(`a ${entityType} does not take ${itemId}, a ${type} item`);
    }
  return [...problems];
}

/**
 * Cancels a population: the jobs of its runs stop their active work, and nothing runs or publishes.
 * Nothing is deleted.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {string} params.actor
 * @param {Date} [params.now]
 * @returns {Promise<Object>} {@link populationView}.
 * @throws {Error} 404 for an unknown population; 409 for a cancelled, published or publishing one.
 * @memberof CyberiaPopulation
 */
export async function cancelPopulation({ models, id, actor, now = new Date() }) {
  const population = await openPopulation(models, id);
  for (const jobId of await models.CyberiaProceduralJob.distinct('_id', { populationId: population._id }))
    await cancelJob({ models, jobId, actor, reason: `Population ${id} cancelled`, now }).catch((error) => {
      if (error.status !== 409) throw error;
    });
  await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, cancelledAt: null },
    { $set: { cancelledAt: now } },
  );
  return await getPopulation(models, id);
}

/** The databases that may hold an instance or a map of a host: its base one, the content partition it declares and serves, and every release its ledger keeps for a rollback. */
async function contentDatabases(options) {
  const bucket = DataBaseProviderService.getProvider(options);
  const Release = DataBaseProviderService.servedModels(options).CyberiaContentRelease;
  return [
    ...new Set(
      [
        bucket.connection.name,
        bucket.partitions?.[CONTENT_PARTITION]?.name,
        DataBaseProviderService.servedDatabase(options, CONTENT_PARTITION),
        ...(Release ? (await Release.find({}, { database: 1 }).lean()).map(({ database }) => database) : []),
      ].filter(Boolean),
    ),
  ];
}

/**
 * The files of `ids` something still references: an instance thumbnail or a map thumbnail or preview in
 * any content database of the host, or an instance draft of any population, with the base it started
 * from. `exclude` names the drafts of one population that go with the files.
 * @param {Object} models - {@link populationModels}.
 * @param {string[]} ids - File ids.
 * @param {Object} params
 * @param {Object} params.options - Router options.
 * @param {{populationId:*, codes:string[]}} [params.exclude]
 * @returns {Promise<Set<string>>}
 * @memberof CyberiaPopulation
 */
export async function referencedFiles(models, ids, { options, exclude = null }) {
  const found = new Set();
  if (ids.length === 0) return found;
  const add = (values) => values.filter(Boolean).forEach((value) => found.add(String(value)));
  const { connection } = DataBaseProviderService.getProvider(options);
  for (const database of await contentDatabases(options)) {
    const store = connection.useDb(database, { useCache: true });
    const Instance = await MongooseDB.bindModel(store, 'cyberia-instance');
    const Map = await MongooseDB.bindModel(store, 'cyberia-map');
    add(await Instance.distinct('thumbnail', { thumbnail: { $in: ids } }));
    for (const field of ['thumbnail', 'preview']) add(await Map.distinct(field, { [field]: { $in: ids } }));
  }
  const holders = await models.CyberiaProceduralPopulation.find(
    {
      $or: [
        { 'instanceDrafts.document.thumbnail': { $in: ids } },
        { 'instanceDrafts.base.document.thumbnail': { $in: ids } },
      ],
    },
    { instanceDrafts: 1 },
  ).lean();
  for (const { _id, instanceDrafts } of holders)
    for (const entry of instanceDrafts)
      if (!exclude || String(_id) !== String(exclude.populationId) || !exclude.codes.includes(entry.code))
        add([entry.document.thumbnail, entry.base?.document.thumbnail].filter((value) => ids.includes(String(value))));
  return found;
}

/**
 * Deletes the thumbnail files of instance drafts, and of the stored documents they started from, that
 * nothing references any more ({@link referencedFiles}). Deletes nothing without `apply`.
 * @param {Object} models - {@link populationModels}.
 * @param {Object[]} entries - Instance drafts.
 * @param {Object} params
 * @param {Object} params.options - Router options.
 * @param {{populationId:*, codes:string[]}} [params.exclude] - Drafts that go with the files.
 * @param {boolean} [params.apply=true]
 * @returns {Promise<{deleted:string[], kept:string[]}>} The files nothing references, and the ones something does.
 * @memberof CyberiaPopulation
 */
export async function dropDraftThumbnails(models, entries, { options, exclude, apply = true }) {
  const ids = [
    ...new Set(
      entries
        .flatMap(({ document, base }) => [document?.thumbnail, base?.document?.thumbnail])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const kept = await referencedFiles(models, ids, { options, exclude });
  const deleted = ids.filter((id) => !kept.has(id));
  if (apply && deleted.length > 0)
    await DataBaseProviderService.getModel('File', options).deleteMany({ _id: { $in: deleted } });
  return { deleted, kept: [...kept] };
}

/**
 * Deletes a population of any version, every job it stored with everything they left, and each draft
 * its items stored that nothing else keeps. A published item and a published map keep what the
 * publication wrote.
 * @param {Object} params
 * @param {Object} params.models
 * @param {string} params.id
 * @param {Object} params.options - Router options.
 * @param {Date} [params.now]
 * @returns {Promise<{jobs:number,stopped:number,candidates:number,drafts:number}>}
 * @throws {Error} 404 for an unknown population; 409 while a publication runs before its commit.
 * @memberof CyberiaPopulation
 */
export async function deletePopulation({ models, id, options, now = new Date() }) {
  const { CyberiaProceduralPopulation: Population, CyberiaProceduralJob: Job } = models;
  const population = /^[0-9a-f]{24}$/i.test(String(id)) && (await Population.findById(id).lean());
  if (!population) throw requestError('Population not found', 404);
  const { publication } = population;
  if (publication && !publication.commit && !CLOSED_BEFORE_COMMIT.includes(publication.status))
    throw requestError(heldReason(publication), 409);
  const removed = { jobs: 0, stopped: 0, candidates: 0, drafts: 0 };
  for (const jobId of await Job.distinct('_id', { populationId: population._id })) {
    try {
      const { stopped, candidates, drafts } = await deleteJob({ models, jobId, options, now });
      Object.assign(removed, {
        jobs: removed.jobs + 1,
        stopped: removed.stopped + stopped,
        candidates: removed.candidates + candidates,
        drafts: removed.drafts + drafts.length,
      });
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  const owned = [...population.targets, ...population.removed.map(({ target }) => target)].flatMap(
    ({ drafts = [] }) => drafts,
  );
  if (owned.length > 0) {
    await Population.updateOne(
      { _id: population._id },
      { $set: { 'targets.$[].definitionCid': '', 'removed.$[].target.definitionCid': '' } },
    );
    const drafts = await models.ObjectLayer.distinct('cid', { cid: { $in: owned }, origin: 'draft' });
    removed.drafts += (await purgeRevisions({ models, options, cids: drafts })).length;
  }
  await dropDraftThumbnails(models, population.instanceDrafts ?? [], {
    options,
    exclude: { populationId: population._id, codes: (population.instanceDrafts ?? []).map(({ code }) => code) },
  });
  await Population.deleteOne({ _id: population._id });
  return removed;
}
