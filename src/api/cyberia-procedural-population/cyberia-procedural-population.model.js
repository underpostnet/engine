/**
 * Mongoose model for the CyberiaProceduralPopulation API: one map population of the Procedural
 * Engine, its items, its map draft, its entity-type defaults workspace and its publication.
 *
 * A population freezes the map context it read. Each target is one item id with its own resolution,
 * template, palette and variation, the definition it uses, and the drafts its Studio saves stored.
 * Each run is a job that names the population, under the seed of a run index of the population no
 * other run took; the jobs, their
 * candidates, the review and the audit stay those of the Procedural Engine. The population adds the
 * item decisions, the targets a moderator removed, the map draft, the instance, universe and
 * entity-type default drafts, the default rows of its defaults workspace, and the publication onto
 * the same map.
 *
 * Each draft is a typed copy of fields of its canonical schema (`draftContract`): a field the canonical
 * document does not have is refused at any depth. `context` and `migration` are frozen snapshots of
 * their own version; `publication` is the record the publication worker moves by status under its
 * lease, with the frozen plan and commit it reviewed and wrote.
 *
 * @module src/api/cyberia-procedural-population/cyberia-procedural-population.model.js
 * @namespace CyberiaProceduralPopulationModel
 */
import { Schema, model } from 'mongoose';
import { CONTENT_CODE_PATTERN } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { RESOLUTIONS } from '../../projects/cyberia/procedural/population/resolution.js';
import { CyberiaEntityTypeDefaultSchema } from '../cyberia-entity-type-default/cyberia-entity-type-default.model.js';
import { CyberiaInstanceConfSchema } from '../cyberia-instance-conf/cyberia-instance-conf.model.js';
import { CyberiaInstanceSchema } from '../cyberia-instance/cyberia-instance.model.js';
import { CyberiaMapSchema } from '../cyberia-map/cyberia-map.model.js';
import { CyberiaUniverseSchema } from '../cyberia-universe/cyberia-universe.model.js';

/**
 * The version of the population record. A record of another version is read-only until
 * `cyberia population migrate` moves it to this version.
 * @constant {number}
 * @memberof CyberiaProceduralPopulationModel
 */
export const POPULATION_VERSION = 7;

/**
 * The statuses of a population: `open` while it takes changes, `publishing` while a publication runs
 * before its commit, then `published` or `cancelled`.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralPopulationModel
 */
export const POPULATION_STATUS = Object.freeze(['open', 'publishing', 'published', 'cancelled']);

/**
 * The statuses of a publication. It runs `queued`, `preflight`, `publishing_objects`,
 * `committing_runtime`, `refreshing_runtime`, then `completed`. A phase that fails stops in its own
 * failed status; `published_reload_pending` is committed and waits for the game servers.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralPopulationModel
 */
export const PUBLICATION_STATUS = Object.freeze([
  'queued',
  'preflight',
  'publishing_objects',
  'committing_runtime',
  'refreshing_runtime',
  'completed',
  'preflight_failed',
  'objects_publish_failed',
  'runtime_commit_failed',
  'published_reload_pending',
  'cancelled_before_commit',
]);

/**
 * The publication statuses that leave the population as it was: a failed preflight and a cancel
 * before the commit. The moderator changes the population, then publishes again.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralPopulationModel
 */
export const CLOSED_BEFORE_COMMIT = Object.freeze(['preflight_failed', 'cancelled_before_commit']);

/**
 * The fields of an instance a draft proposes: what the Instance Studio edits.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralPopulationModel
 */
export const INSTANCE_FIELDS = Object.freeze([
  'name',
  'description',
  'tags',
  'status',
  'cyberiaMapCodes',
  'portals',
  'mapLayout',
  'playerSpawn',
  'thumbnail',
]);

/**
 * The fields of an instance conf a draft proposes.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralPopulationModel
 */
export const CONF_FIELDS = Object.freeze(['aoiRadius', 'economyCode', 'entityDefaults']);

/**
 * The fields of a universe a draft proposes: what the Universe Studio edits.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralPopulationModel
 */
export const UNIVERSE_FIELDS = Object.freeze(['name', 'description', 'instances', 'links']);

/**
 * The fields of an entity-type default a draft or a variant holds.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralPopulationModel
 */
export const DEFAULT_ROW_FIELDS = Object.freeze([
  'entityType',
  'liveItemIds',
  'deadItemIds',
  'dropItemIds',
  'inventoryItemsIds',
  'overrideItemsIdsState',
  'behavior',
]);

/** The reference an instance conf draft holds: a stored row id, a variant it proposes, or a new row a default draft proposes. */
const DEFAULT_REF = /^([0-9a-f]{24}|(variant|draft):[0-9a-f-]{36})$/;

const STRICT = Object.freeze({ _id: false, strict: 'throw' });

/** A definition without the index options of its canonical path: a draft adds no index to the population. */
const unindexed = (definition) =>
  definition && typeof definition === 'object' && !Array.isArray(definition) && !(definition instanceof Schema)
    ? (({ index, unique, ...rest }) => rest)(definition)
    : definition;

/**
 * A strict copy of `fields` of a canonical schema, its subdocuments copied the same way: the copy
 * keeps the types, defaults and validators of each path, refuses a field the canonical document does
 * not have at any depth, and leaves the canonical schema as it is.
 * @param {Schema} schema - A canonical schema.
 * @param {ReadonlyArray<string>} [fields] - Its top-level paths to copy; all of them by default.
 * @returns {Schema}
 */
const draftContract = (schema, fields = Object.keys(schema.obj)) => {
  const copy = new Schema(Object.fromEntries(fields.map((field) => [field, unindexed(schema.obj[field])])), STRICT);
  copy.eachPath((path, type) => {
    if (!type.schema) return;
    const child = draftContract(type.schema);
    copy.remove(path);
    copy.add({ [path]: { ...unindexed(type.options), type: Array.isArray(type.options.type) ? [child] : child } });
  });
  return copy;
};

const codePath = () => ({ type: String, required: true, match: CONTENT_CODE_PATTERN });
const baseRevision = () => ({ type: Number, default: null, min: 1 });
const draftRevision = () => ({ type: Number, required: true, min: 1 });
const saved = () => ({ savedAt: { type: Date, required: true }, savedBy: { type: String, default: '' } });

const InstanceDocumentSchema = draftContract(CyberiaInstanceSchema, INSTANCE_FIELDS);

const InstanceConfSchema = draftContract(
  CyberiaInstanceConfSchema,
  CONF_FIELDS.filter((field) => field !== 'entityDefaults'),
);
InstanceConfSchema.add({
  entityDefaults: {
    type: [String],
    default: [],
    validate: {
      validator: (refs) => refs.every((ref) => DEFAULT_REF.test(ref)),
      message: 'An entity-type default reference is a row id, a variant of the draft or a new row of the population',
    },
  },
});

const DefaultRowSchema = draftContract(CyberiaEntityTypeDefaultSchema, DEFAULT_ROW_FIELDS);

/** A copy of a shared or global row that one instance runs: created at the publication with its reference. */
const VariantSchema = new Schema(
  {
    key: { type: String, required: true },
    from: { type: String, required: true },
    scope: { type: String, required: true, enum: ['shared', 'global'] },
    row: { type: DefaultRowSchema, required: true },
  },
  STRICT,
);

const InstanceDraftSchema = new Schema(
  {
    code: codePath(),
    baseRevision: baseRevision(),
    base: {
      type: new Schema({ document: InstanceDocumentSchema, conf: InstanceConfSchema }, STRICT),
      default: null,
    },
    revision: draftRevision(),
    document: { type: InstanceDocumentSchema, required: true },
    conf: { type: InstanceConfSchema, required: true },
    variants: { type: [VariantSchema], default: [] },
    ...saved(),
  },
  STRICT,
);

const UniverseDocumentSchema = draftContract(CyberiaUniverseSchema, UNIVERSE_FIELDS);

const UniverseDraftSchema = new Schema(
  {
    code: codePath(),
    baseRevision: baseRevision(),
    base: { type: UniverseDocumentSchema, default: null },
    revision: draftRevision(),
    document: { type: UniverseDocumentSchema, required: true },
    ...saved(),
  },
  STRICT,
);

/**
 * A change of a stored entity-type default (`rowId`), or a new row: written at the publication. An
 * instance draft references a new row as `draft:<key>`. `global` records that the moderator chose to
 * have every world run a row no instance references.
 */
const DefaultDraftSchema = new Schema(
  {
    key: { type: String, required: true },
    rowId: { type: String, default: null },
    baseUpdatedAt: { type: Date, default: null },
    revision: draftRevision(),
    row: { type: DefaultRowSchema, required: true },
    global: { type: Boolean, default: false },
    ...saved(),
  },
  STRICT,
);

const MapDraftSchema = draftContract(CyberiaMapSchema, ['entities']);
MapDraftSchema.add({
  grid: { type: draftContract(CyberiaMapSchema, ['gridX', 'gridY', 'cellWidth', 'cellHeight']), required: true },
  baseRevision: { type: Number, required: true, min: 1 },
  revision: draftRevision(),
  ...saved(),
});

const TargetSchema = new Schema(
  {
    itemId: { type: String, required: true },
    itemType: { type: String, required: true },
    stage: { type: String, required: true },
    sources: { type: [String], default: [] },
    foundation: { type: Schema.Types.Mixed, default: [] },
    expected: { type: Number, default: null },
    placements: { type: Number, default: 0 },
    cid: { type: String, default: null },
    hasRender: { type: Boolean, default: false },
    resolution: { type: String, required: true, enum: RESOLUTIONS },
    templateId: { type: String, default: '' },
    definitionCid: { type: String, default: '' },
    observed: { type: Schema.Types.Mixed, default: null },
    palette: { type: Schema.Types.Mixed, default: () => ({ slots: {} }) },
    variation: { type: Number, default: null, min: 0, max: 1 },
    drafts: { type: [String], default: [] },
  },
  { _id: false, minimize: false },
);

const RemovedSchema = new Schema(
  {
    target: { type: TargetSchema, required: true },
    by: { type: String, default: '' },
    at: { type: Date, required: true },
    reason: { type: String, default: '' },
  },
  { _id: false, minimize: false },
);

const DefaultsSchema = new Schema(
  {
    added: { type: [Schema.Types.ObjectId], default: [] },
    removed: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false },
);

/**
 * The publication record. `requestPublication` writes it as `queued`; a moderator writes only
 * `cancelRequestedAt`, a retry and an idle cancel. Every other write is the worker's, by path, under
 * a filter on `id`, `status` and `lease.holder`, so a worker that lost its lease changes nothing.
 * @typedef {Object} PopulationPublication
 * @property {string} id - One publication of the population
 * @property {string} status - {@link PUBLICATION_STATUS}
 * @property {Date} requestedAt
 * @property {string} requestedBy - User id of the moderator
 * @property {string[]} acknowledged - The item ids whose global change the moderator accepted
 * @property {{holder:string,expiresAt:Date}|null} lease - The worker that runs it, until `expiresAt`
 * @property {Date|null} cancelRequestedAt - A cancel the worker applies at its next phase, before the commit
 * @property {number} reloadTries - Reloads of the game servers tried; see `RELOAD_TRIES`
 * @property {Date|null} nextAttemptAt - When the next reload is due
 * @property {Object|null} plan - Frozen by the preflight: the population, map and draft revisions, the
 *   kept bindings, the assets, the instance, universe, variant and default drafts with the revision each
 *   starts from, the worlds to reload and the `manifestHash`
 * @property {Object|null} commit - Written once, in the commit transaction: what it wrote, from which
 *   revision to which, and the rows it created
 * @property {{cache:boolean,media:Object|null,previews:string,servers:Object[],at:Date}|null} refresh - The
 *   last refresh of the runtime
 * @property {{phase:string,message:string,problems?:string[],retryable?:boolean,at:Date}|null} error - The
 *   failure of the last phase
 * @property {{status:string,at:Date}[]} history - Each status, in order
 * @memberof CyberiaProceduralPopulationModel
 */

/**
 * @typedef {Object} CyberiaProceduralPopulation
 * @property {string} mapCode - The map the population reads and publishes onto
 * @property {number} mapRevision - The revision of the map it read
 * @property {string} fingerprint - SHA-256 of the map, the content and the root seed: one population each
 * @property {number} rootSeed - The seed every target seed derives from
 * @property {Object} context - The frozen map context
 * @property {number} version - {@link POPULATION_VERSION}
 * @property {number} revision - Writes of the targets, the removals, the default changes and the drafts
 * @property {number} nextRun - The run index the next run of any target takes: no two runs share a seed
 * @property {Object[]} targets - Each item id with its sources, decision and configuration; a `keep`
 *   decision holds the `observed` binding `{cid, bindingRevision}`; `drafts` lists the definitions its
 *   Studio saves stored, and `definitionCid` the one it uses
 * @property {Object[]} removed - Each target a moderator removed, with who removed it, when and why
 * @property {{grid:{gridX:number,gridY:number,cellWidth:number,cellHeight:number},entities:Object[],baseRevision:number,revision:number,savedAt:Date,savedBy:string}|null} draft - The map to publish: its grid and placements, and the map revision they start from
 * @property {Object[]} instanceDrafts - The instances to publish, one entry per code: `document`, `conf`,
 *   `variants`, the revision of the stored instance it starts from (`baseRevision`, null for a new one),
 *   the stored `base` it started from and its own `revision`; see `population/working-graph.js`
 * @property {Object[]} universeDrafts - The universes to publish, one entry per code, in the same form
 * @property {Object[]} defaultDrafts - The entity-type defaults to publish, one entry per key: the `row`,
 *   the stored row it changes (`rowId`, null for a new row) with the `updatedAt` it read, and whether
 *   the moderator chose that every world runs it (`global`)
 * @property {{added:ObjectId[],removed:ObjectId[]}} defaults - The entity-type default rows the moderator
 *   added to the defaults workspace, and the rows of the staged items the moderator removed from it
 * @property {Object|null} migration - What the migration from an earlier version changed and kept
 * @property {PopulationPublication|null} publication - The publication that runs or ran
 * @property {Date|null} cancelledAt - When a moderator cancelled it
 * @property {Date|null} draftsPrunedAt - When a cleanup cleared the working copies of the closed population
 * @property {string} createdBy - User id of the moderator who created it
 * @memberof CyberiaProceduralPopulationModel
 */
const CyberiaProceduralPopulationSchema = new Schema(
  {
    version: { type: Number, required: true, default: POPULATION_VERSION, immutable: true },
    mapCode: { type: String, required: true, trim: true, immutable: true },
    mapRevision: { type: Number, required: true, immutable: true },
    fingerprint: { type: String, required: true, unique: true, immutable: true },
    rootSeed: { type: Number, required: true, min: 0, immutable: true },
    context: { type: Schema.Types.Mixed, required: true, immutable: true },
    revision: { type: Number, default: 0, min: 0 },
    nextRun: { type: Number, default: 0, min: 0 },
    targets: { type: [TargetSchema], default: [] },
    removed: { type: [RemovedSchema], default: [] },
    draft: { type: MapDraftSchema, default: null },
    instanceDrafts: { type: [InstanceDraftSchema], default: [] },
    universeDrafts: { type: [UniverseDraftSchema], default: [] },
    defaultDrafts: { type: [DefaultDraftSchema], default: [] },
    defaults: { type: DefaultsSchema, default: () => ({ added: [], removed: [] }) },
    // TODO: give `publication` a typed contract; its writers set it by path under the lease filter.
    publication: { type: Schema.Types.Mixed, default: null },
    migration: { type: Schema.Types.Mixed, default: null },
    cancelledAt: { type: Date, default: null },
    draftsPrunedAt: { type: Date, default: null },
    createdBy: { type: String, default: '', trim: true, immutable: true },
  },
  { timestamps: true, minimize: false },
);

CyberiaProceduralPopulationSchema.index({ mapCode: 1, createdAt: -1 });
CyberiaProceduralPopulationSchema.index({ createdAt: -1 });
CyberiaProceduralPopulationSchema.index({ 'publication.status': 1, 'publication.lease.expiresAt': 1 });

const CyberiaProceduralPopulationModel = model('CyberiaProceduralPopulation', CyberiaProceduralPopulationSchema);

const ProviderSchema = CyberiaProceduralPopulationSchema;

class CyberiaProceduralPopulationDto {
  static select = {
    /** A list row: what the state of a population derives from, without the context body or draft entities. */
    list: () => ({
      version: 1,
      mapCode: 1,
      mapRevision: 1,
      createdAt: 1,
      updatedAt: 1,
      cancelledAt: 1,
      'publication.status': 1,
      'publication.commit': 1,
      'draft.revision': 1,
      'context.map': 1,
      'targets.itemId': 1,
      'targets.stage': 1,
      'targets.resolution': 1,
      'targets.definitionCid': 1,
      'targets.observed': 1,
      'targets.cid': 1,
    }),
  };
}

export {
  CyberiaProceduralPopulationSchema,
  CyberiaProceduralPopulationModel,
  ProviderSchema,
  CyberiaProceduralPopulationDto,
};
