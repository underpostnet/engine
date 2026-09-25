/**
 * Mongoose model for the CyberiaContentRelease API: one record per versioned Cyberia content
 * database, and which one the runtime serves.
 *
 * A release is built into its own database, validated there, and promoted by switching the
 * active pointer. The record lives in the runtime database, which no content deployment
 * touches, so promotion and rollback survive any content operation. A promoted release is never
 * rebuilt: its database is only read.
 *
 * @module src/api/cyberia-content-release/cyberia-content-release.model.js
 * @namespace CyberiaContentReleaseModel
 */
import { Schema, model } from 'mongoose';

/** Lifecycle of a release. Exactly one release is `active` at a time. */
export const RELEASE_STATUS = Object.freeze(['candidate', 'validated', 'invalid', 'active', 'retired']);

/** Release ids name a database suffix: lower-case letters, digits and dashes (MongoDB refuses dots). */
export const RELEASE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

const CheckSchema = new Schema(
  {
    name: { type: String, required: true },
    ok: { type: Boolean, required: true },
    count: { type: Number, default: 0 },
    findings: { type: [String], default: [] },
  },
  { _id: false },
);

/**
 * @typedef {Object} CyberiaContentRelease
 * @property {string} releaseId - Unique release id, the database suffix
 * @property {string} database - Database the release content lives in
 * @property {string} status - One of {@link RELEASE_STATUS}
 * @property {string[]} instances - Instance codes the release carries
 * @property {{from:string,engineVersion:string,commit:string,builtAt:Date,builtBy:string}} source - What the release was built from
 * @property {{instances:string[],maps:number,bindings:number,quests:number,actions:number}} manifest - What the release carries
 * @property {string[]} dependencies - Every Object Layer cid the release binds or pins
 * @property {{ok:boolean,checkedAt:Date,checks:Array}} validation - Last validation report
 * @property {Date} promotedAt - When the release became active
 * @property {Date} retiredAt - When another release replaced it
 * @memberof CyberiaContentReleaseModel
 */
const CyberiaContentReleaseSchema = new Schema(
  {
    releaseId: { type: String, required: true, unique: true, trim: true, match: RELEASE_ID_PATTERN },
    database: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: RELEASE_STATUS, default: 'candidate' },
    instances: { type: [String], default: [] },
    source: {
      from: { type: String, enum: ['backups', 'workspace'], default: 'backups' },
      engineVersion: { type: String, default: '' },
      commit: { type: String, default: '' },
      builtAt: { type: Date, default: Date.now },
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
    promotedAt: { type: Date },
    retiredAt: { type: Date },
  },
  { timestamps: true },
);

CyberiaContentReleaseSchema.index({ status: 1, promotedAt: -1 });
// At most one release is active: a second promotion racing the first fails instead of doubling.
CyberiaContentReleaseSchema.index({ status: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });

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
      instances: 1,
      source: 1,
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
