/**
 * Mongoose model for the CyberiaSagaWorkflow API: one authoring workflow of a saga in the Saga Engine.
 *
 * A workflow holds workflow data only: the narrative context, the generations of the semantic
 * generator with their stage results, the candidate packages, the last check, the application to the
 * content source, the dependencies a moderator excludes and the history. The canonical saga package
 * stays in cyberia-content; a candidate is canonical only once applied there.
 *
 * A generation is a durable job a worker runs under a lease, one step at a time: the theme, the six
 * stages and the package. Its request is frozen when it is queued. Candidates are append-only: a
 * generation or a save adds a revision and never changes one.
 *
 * @module src/api/cyberia-saga-workflow/cyberia-saga-workflow.model.js
 * @namespace CyberiaSagaWorkflowModel
 */
import { Schema, model } from 'mongoose';

/**
 * The statuses of a generation: it runs `queued`, `running`, then `completed`, `failed` or `cancelled`.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaSagaWorkflowModel
 */
export const GENERATION_STATUS = Object.freeze(['queued', 'running', 'completed', 'failed', 'cancelled']);

/**
 * The statuses of a generation that a worker still runs.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaSagaWorkflowModel
 */
export const ACTIVE_GENERATION = Object.freeze(['queued', 'running']);

/**
 * Where a candidate comes from: a generation, a moderator edit, or the content source it opened.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaSagaWorkflowModel
 */
export const CANDIDATE_KINDS = Object.freeze(['generated', 'edited', 'content']);

/**
 * The recorded actions of a workflow.
 * @constant {ReadonlyArray<string>}
 * @memberof CyberiaSagaWorkflowModel
 */
export const HISTORY_ACTIONS = Object.freeze([
  'workflow.created',
  'context.updated',
  'generation.queued',
  'generation.step_done',
  'generation.step_failed',
  'generation.completed',
  'generation.failed',
  'generation.cancel_requested',
  'generation.cancelled',
  'generation.retried',
  'candidate.saved',
  'candidate.validated',
  'candidate.applied',
  'exclusion.set',
  'exclusion.removed',
]);

const text = (max) => ({ type: String, trim: true, default: '', maxlength: max });

/** The narrative context of the next generation: what the moderator asks the generator for. */
const ContextSchema = new Schema(
  {
    prompt: text(4000),
    lore: text(60000),
    spaceContext: text(32),
    tone: text(32),
    factionContext: text(200),
    characterContext: text(400),
    culturalExposure: text(32),
    thinkingLevel: text(16),
    model: text(120),
    temperature: { type: Number, min: 0, max: 2, default: null },
    saga: { code: text(64), name: text(200), description: text(2000) },
    reuse: { type: [{ type: String, trim: true, maxlength: 200 }], default: [] },
    sagas: { type: [{ type: String, trim: true, maxlength: 64 }], default: [] },
  },
  { _id: false },
);

const StepSchema = new Schema(
  {
    id: { type: String, required: true },
    status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    error: { type: String, default: '' },
    log: { type: [String], default: [] },
  },
  { _id: false },
);

const GenerationSchema = new Schema(
  {
    attempt: { type: Number, required: true, min: 1 },
    status: { type: String, enum: GENERATION_STATUS, default: 'queued' },
    // The request the generator runs and where it ran from: frozen when the generation is queued.
    request: { type: Schema.Types.Mixed, required: true },
    provenance: {
      contentVersion: { type: String, default: '' },
      artifactSchema: { type: Number, default: null },
      artifactRevision: { type: String, default: '' },
      checkoutRevision: { type: String, default: '' },
      model: { type: String, default: '' },
    },
    // The generator state after the last step done: the stage results a retry resumes from.
    state: { type: Schema.Types.Mixed, required: true },
    steps: { type: [StepSchema], default: [] },
    lease: { holder: { type: String, default: '' }, expiresAt: { type: Date, default: null } },
    cancelRequestedAt: { type: Date, default: null },
    error: {
      message: { type: String, default: '' },
      retryable: { type: Boolean, default: false },
      at: { type: Date, default: null },
    },
    candidate: { type: Number, default: null },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
  },
  { _id: false },
);

const CandidateSchema = new Schema(
  {
    revision: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: CANDIDATE_KINDS, required: true },
    package: { type: Schema.Types.Mixed, required: true },
    // sha256 of the canonical JSON of the package: the bytes its content file holds.
    digest: { type: String, required: true },
    // What a list shows of the package, which never changes.
    sagaCode: { type: String, default: '' },
    name: { type: String, default: '' },
    definitions: { type: Number, default: 0 },
    generation: { type: Number, default: null },
    parent: { type: Number, default: null },
    actor: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * @typedef {Object} CyberiaSagaWorkflow
 * @property {string} sagaCode - The code of the saga the newest candidate composes.
 * @property {Object} context - The narrative context of the next generation.
 * @property {{source:'new'|'content', digest:string, checkoutRevision:string}} base - What the
 *   content file held when the workflow opened it.
 * @property {Object[]} generations - Each generation, with its frozen request, steps and state.
 * @property {Object[]} candidates - Each candidate package, by revision.
 * @property {Object|null} validation - The last check: the revision, digest, findings and when.
 * @property {Object|null} applied - The candidate the content source holds from this workflow.
 * @property {Object[]} exclusions - The dependencies a moderator leaves out, with the reason.
 * @property {Object[]} history - Who did what, when.
 * @memberof CyberiaSagaWorkflowModel
 */
const CyberiaSagaWorkflowSchema = new Schema(
  {
    sagaCode: { type: String, trim: true, default: '' },
    context: { type: ContextSchema, default: () => ({}) },
    base: {
      source: { type: String, enum: ['new', 'content'], default: 'new' },
      digest: { type: String, default: '' },
      checkoutRevision: { type: String, default: '' },
    },
    generations: { type: [GenerationSchema], default: [] },
    candidates: { type: [CandidateSchema], default: [] },
    validation: {
      type: new Schema(
        {
          revision: Number,
          digest: String,
          ok: Boolean,
          findings: { type: Schema.Types.Mixed, default: [] },
          checkedAt: Date,
        },
        { _id: false },
      ),
      default: null,
    },
    applied: {
      type: new Schema(
        {
          revision: Number,
          digest: String,
          file: String,
          checkoutRevision: String,
          at: Date,
          actor: String,
        },
        { _id: false },
      ),
      default: null,
    },
    exclusions: {
      type: [
        new Schema(
          {
            key: { type: String, required: true, trim: true, maxlength: 300 },
            reason: { type: String, required: true, trim: true, maxlength: 1000 },
            actor: { type: String, required: true },
            at: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    history: {
      type: [
        new Schema(
          {
            action: { type: String, enum: HISTORY_ACTIONS, required: true },
            actor: { type: String, required: true },
            at: { type: Date, required: true },
            detail: { type: String, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

CyberiaSagaWorkflowSchema.index({ sagaCode: 1, updatedAt: -1 });
CyberiaSagaWorkflowSchema.index({ 'generations.status': 1 });

const CyberiaSagaWorkflowModel = model('CyberiaSagaWorkflow', CyberiaSagaWorkflowSchema);
const ProviderSchema = CyberiaSagaWorkflowSchema;

export { CyberiaSagaWorkflowSchema, CyberiaSagaWorkflowModel, ProviderSchema };
