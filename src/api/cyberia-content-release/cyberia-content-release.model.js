/**
 * Mongoose model for the CyberiaContentRelease API: one record per versioned Cyberia content
 * database, and which one the runtime serves.
 *
 * A release is built into its own database, validated there, and promoted by switching the active
 * pointer. The record lives in the runtime database, which no content deployment touches. The
 * collection holds every invariant: one release at most is active, and one executes.
 *
 * @module src/api/cyberia-content-release/cyberia-content-release.model.js
 * @namespace CyberiaContentReleaseModel
 */
import { Schema, model } from 'mongoose';
import { RELEASE_ID_PATTERN, SOURCE_CHANNELS } from '../../server/release/source-release.js';

/** Lifecycle of a release. */
export const RELEASE_STATUS = Object.freeze(['building', 'candidate', 'validated', 'failed', 'active', 'retired']);

const CheckSchema = new Schema(
  {
    name: { type: String, required: true },
    ok: { type: Boolean, required: true },
    count: { type: Number, default: 0 },
    findings: { type: [String], default: [] },
  },
  { _id: false },
);

const SourceSchema = new Schema(
  {
    name: { type: String, required: true },
    repository: { type: String, required: true },
    sourceRevision: { type: String, required: true },
  },
  { _id: false },
);

/**
 * @typedef {Object} CyberiaContentRelease
 * @property {string} releaseId - Unique release id, the database suffix
 * @property {string} database - Database the release content lives in
 * @property {string} status - One of {@link RELEASE_STATUS}
 * @property {{stage:string,message:string,at:Date}} failure - Where and why a failed release stopped
 * @property {string[]} instances - Instance codes the release carries
 * @property {{from:string,channel:string,repository:string,sourceRevision:string}} source - What the
 *   release is built from: an exact source revision (`from: source`), the local artifact or the workspace
 * @property {Array<{name:string,repository:string,sourceRevision:string}>} sources - Every source the deploy resolved
 * @property {{version:string,digest:string}} content - The content artifact the release carries
 * @property {{engineVersion:string,engineCommit:string,job:string,builtAt:Date,builtBy:string}} provenance - Who built it
 * @property {{instances:string[],maps:number,bindings:number,quests:number,actions:number}} manifest - What the release carries
 * @property {string[]} dependencies - Every Object Layer cid the release binds or pins
 * @property {{ok:boolean,checkedAt:Date,checks:Array}} validation - Last validation report
 * @property {{holder:string,heartbeatAt:Date}} lease - The execution building the release
 * @property {Date} promotedAt - When the release became active
 * @property {Date} retiredAt - When another release replaced it
 * @memberof CyberiaContentReleaseModel
 */
const CyberiaContentReleaseSchema = new Schema(
  {
    releaseId: { type: String, required: true, unique: true, trim: true, match: RELEASE_ID_PATTERN },
    database: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: RELEASE_STATUS, default: 'building' },
    failure: {
      stage: { type: String, default: '' },
      message: { type: String, default: '' },
      at: { type: Date },
    },
    instances: { type: [String], default: [] },
    source: {
      from: { type: String, enum: ['source', 'backups', 'workspace'], default: 'backups' },
      channel: { type: String, enum: ['', ...SOURCE_CHANNELS], default: '' },
      repository: { type: String, default: '' },
      sourceRevision: { type: String, default: '' },
    },
    sources: { type: [SourceSchema], default: [] },
    content: {
      version: { type: String, default: '' },
      digest: { type: String, default: '' },
    },
    provenance: {
      engineVersion: { type: String, default: '' },
      engineCommit: { type: String, default: '' },
      job: { type: String, default: '' },
      builtAt: { type: Date },
      builtBy: { type: String, default: '' },
    },
    manifest: {
      instances: { type: [String], default: [] },
      maps: { type: Number, default: 0 },
      bindings: { type: Number, default: 0 },
      quests: { type: Number, default: 0 },
      actions: { type: Number, default: 0 },
    },
    dependencies: { type: [String], default: [] },
    validation: {
      ok: { type: Boolean, default: false },
      checkedAt: { type: Date },
      checks: { type: [CheckSchema], default: [] },
    },
    lease: {
      executing: { type: Boolean },
      holder: { type: String },
      heartbeatAt: { type: Date },
    },
    promotedAt: { type: Date },
    retiredAt: { type: Date },
  },
  { timestamps: true },
);

CyberiaContentReleaseSchema.index({ status: 1, promotedAt: -1 });
// A host serves one content database: a second promotion racing the first fails instead of doubling.
CyberiaContentReleaseSchema.index({ status: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
// One release executes at a time, whatever channel its source came from.
CyberiaContentReleaseSchema.index(
  { 'lease.executing': 1 },
  { unique: true, partialFilterExpression: { 'lease.executing': true } },
);

/**
 * The release the runtime serves, or null before the first promotion.
 * @returns {Promise<Object|null>}
 * @memberof CyberiaContentReleaseModel
 */
CyberiaContentReleaseSchema.statics.active = async function () {
  return await this.findOne({ status: 'active' }).sort({ promotedAt: -1 }).lean();
};

/**
 * The release that was active before the current one: the rollback target.
 * @returns {Promise<Object|null>}
 * @memberof CyberiaContentReleaseModel
 */
CyberiaContentReleaseSchema.statics.previousActive = async function () {
  return await this.findOne({ status: 'retired', promotedAt: { $ne: null } })
    .sort({ retiredAt: -1 })
    .lean();
};

const CyberiaContentReleaseModel = model('CyberiaContentRelease', CyberiaContentReleaseSchema);
const ProviderSchema = CyberiaContentReleaseSchema;

class CyberiaContentReleaseDto {
  static select = {
    get: () => ({
      _id: 1,
      releaseId: 1,
      database: 1,
      status: 1,
      failure: 1,
      instances: 1,
      source: 1,
      sources: 1,
      content: 1,
      provenance: 1,
      manifest: 1,
      dependencies: 1,
      validation: 1,
      promotedAt: 1,
      retiredAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}

export { CyberiaContentReleaseSchema, CyberiaContentReleaseModel, ProviderSchema, CyberiaContentReleaseDto };
