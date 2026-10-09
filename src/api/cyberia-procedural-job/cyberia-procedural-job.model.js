/**
 * Mongoose model for the CyberiaProceduralJob API: one generation run of the Procedural Engine.
 *
 * A job holds the exact generation spec its items follow. The spec, its fingerprint and the run
 * identity never change after creation, so equal specs name one job and a retry reproduces the same
 * items. The items live in their own collection, so a batch never meets a document size limit.
 *
 * @module src/api/cyberia-procedural-job/cyberia-procedural-job.model.js
 * @namespace CyberiaProceduralJobModel
 */
import { Schema, model } from 'mongoose';

/**
 * Lifecycle of a job: `cancelled` stops generation and stays; otherwise a job runs while an item
 * waits or runs, and is completed when none does.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaProceduralJobModel
 */
export const JOB_STATUS = Object.freeze(['queued', 'running', 'completed', 'cancelled']);

/**
 * @typedef {Object} CyberiaProceduralJob
 * @property {string} generatorId - Generator that runs the items
 * @property {string} proceduralProfileId - Profile the items follow
 * @property {string} generationRunId - Identity of the run, derived from the fingerprint
 * @property {string} requestFingerprint - SHA-256 of the canonical spec: one job per spec
 * @property {number} rootSeed - Seed the item seeds derive from
 * @property {Object} spec - The exact generation spec
 * @property {string} status - One of {@link JOB_STATUS}
 * @property {Object<string,number>} counts - Items by status, as of the last transition
 * @property {string} createdBy - User id of the moderator who created the job
 * @property {Date} startedAt - When the first item ran
 * @property {Date} finishedAt - When no item waited or ran
 * @memberof CyberiaProceduralJobModel
 */
const CyberiaProceduralJobSchema = new Schema(
  {
    generatorId: { type: String, required: true, trim: true, immutable: true },
    proceduralProfileId: { type: String, required: true, trim: true, immutable: true },
    generationRunId: { type: String, required: true, unique: true, trim: true, immutable: true },
    requestFingerprint: { type: String, required: true, unique: true, trim: true, immutable: true },
    rootSeed: { type: Number, required: true, min: 0, immutable: true },
    spec: { type: Schema.Types.Mixed, required: true, immutable: true },
    status: { type: String, required: true, enum: JOB_STATUS, default: 'queued' },
    counts: { type: Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: String, default: '', trim: true, immutable: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

CyberiaProceduralJobSchema.index({ status: 1, createdAt: -1 });
CyberiaProceduralJobSchema.index({ createdBy: 1, createdAt: -1 });

const CyberiaProceduralJobModel = model('CyberiaProceduralJob', CyberiaProceduralJobSchema);
const ProviderSchema = CyberiaProceduralJobSchema;

class CyberiaProceduralJobDto {
  static select = {
    get: () => ({
      _id: 1,
      generatorId: 1,
      proceduralProfileId: 1,
      generationRunId: 1,
      requestFingerprint: 1,
      rootSeed: 1,
      spec: 1,
      status: 1,
      counts: 1,
      createdBy: 1,
      startedAt: 1,
      finishedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}

export { CyberiaProceduralJobSchema, CyberiaProceduralJobModel, ProviderSchema, CyberiaProceduralJobDto };
