/**
 * Mongoose model for the CyberiaProceduralPopulation API: one map population of the Procedural
 * Engine, its items, its map draft, its entity-type defaults workspace and its publication.
 *
 * A population freezes the map context it read. Each target is one item id with its own resolution,
 * template, palette and variation, the definition it uses, and the drafts its Studio saves stored.
 * Each run is a job that names the population, under the seed of a run index of the population no
 * other run took; the jobs, their
 * candidates, the review and the audit stay those of the Procedural Engine. The population adds the
 * item decisions, the targets a moderator removed, the map draft, the entity-type default rows of its
 * defaults workspace, and the publication onto the same map.
 *
 * @module src/api/cyberia-procedural-population/cyberia-procedural-population.model.js
 * @namespace CyberiaProceduralPopulationModel
 */
import { Schema, model } from 'mongoose';
import { RESOLUTIONS } from '../../projects/cyberia/procedural/population/resolution.js';

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
 * @typedef {Object} CyberiaProceduralPopulation
 * @property {string} mapCode - The map the population reads and publishes onto
 * @property {number} mapRevision - The revision of the map it read
 * @property {string} fingerprint - SHA-256 of the map, the content and the root seed: one population each
 * @property {number} rootSeed - The seed every target seed derives from
 * @property {Object} context - The frozen map context
 * @property {number} version - {@link POPULATION_VERSION}
 * @property {number} revision - Writes of the targets, the removals, the default changes and the draft
 * @property {number} nextRun - The run index the next run of any target takes: no two runs share a seed
 * @property {Object[]} targets - Each item id with its sources, decision and configuration; a `keep`
 *   decision holds the `observed` binding `{cid, bindingRevision}`; `drafts` lists the definitions its
 *   Studio saves stored, and `definitionCid` the one it uses
 * @property {Object[]} removed - Each target a moderator removed, with who removed it, when and why
 * @property {{grid:{gridX:number,gridY:number,cellWidth:number,cellHeight:number},entities:Object[],baseRevision:number,revision:number,savedAt:Date,savedBy:string}|null} draft - The map to publish: its grid and placements, and the map revision they start from
 * @property {{added:ObjectId[],removed:ObjectId[]}} defaults - The entity-type default rows the moderator
 *   added to the defaults workspace, and the rows of the staged items the moderator removed from it
 * @property {Object|null} migration - What the migration from an earlier version changed and kept
 * @property {Object|null} publication - The publication that runs or ran
 * @property {Date|null} cancelledAt - When a moderator cancelled it
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
    draft: { type: Schema.Types.Mixed, default: null },
    defaults: { type: DefaultsSchema, default: () => ({ added: [], removed: [] }) },
    publication: { type: Schema.Types.Mixed, default: null },
    migration: { type: Schema.Types.Mixed, default: null },
    cancelledAt: { type: Date, default: null },
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
