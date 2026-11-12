/**
 * CyberiaSagaWorkflow service: the workflow API of the Saga Engine. A moderator opens or starts a
 * saga workflow, sets its narrative context, generates candidates in the background, edits, diffs and
 * checks them, applies one to the content source, and reads the completeness report of a candidate.
 *
 * @module src/api/cyberia-saga-workflow/cyberia-saga-workflow.service.js
 * @namespace CyberiaSagaWorkflowService
 */
import { DataQuery } from '../../server/storage/data-query.js';
import {
  applyCandidate,
  candidateSemantic,
  createWorkflow,
  diffCandidate,
  listWorkflows,
  readCandidate,
  readWorkflow,
  saveCandidate,
  setExclusion,
  updateContext,
  validateCandidate,
  workflowModels,
} from '../../projects/cyberia/saga/saga-workflow.js';
import {
  cancelGeneration,
  readGeneration,
  retryGeneration,
  startGeneration,
} from '../../projects/cyberia/saga/saga-generation.js';
import { buildReport } from '../../projects/cyberia/saga/saga-report.js';

const actorOf = (req) => String(req.auth.user._id);
const paged = (page, { data, total }) => ({ data, total, page: page.page, totalPages: Math.ceil(total / page.limit) });

class CyberiaSagaWorkflowService {
  /** GET `/` (paginated, newest change first) or `/:id`: workflow summaries, or one workflow view. */
  static get = async (req, res, options) => {
    const models = workflowModels(options);
    if (req.params.id) return await readWorkflow(models, req.params.id);
    const page = DataQuery.parse(req.query);
    return paged(page, await listWorkflows(models, page));
  };

  /** POST `/`: opens the saga `{ sagaCode }` of the content source, or starts `{ context }`. */
  static post = async (req, res, options) =>
    await createWorkflow({ models: workflowModels(options), body: req.body, actor: actorOf(req) });

  /** PUT `/:id/context`: sets fields of the narrative context of the next generation. */
  static context = async (req, res, options) =>
    await updateContext({ models: workflowModels(options), id: req.params.id, body: req.body, actor: actorOf(req) });

  /** POST `/:id/generations`: queues the next generation; `{ context }` sets context fields first. */
  static generate = async (req, res, options) =>
    await startGeneration({ models: workflowModels(options), id: req.params.id, body: req.body, actor: actorOf(req) });

  /** GET `/:id/generations/:attempt`: a generation with its stage results. */
  static generation = async (req, res, options) =>
    await readGeneration(workflowModels(options), req.params.id, Number(req.params.attempt));

  /** POST `/:id/generations/:attempt/cancel`: stops a generation that waits or runs. */
  static cancelGeneration = async (req, res, options) =>
    await cancelGeneration({
      models: workflowModels(options),
      id: req.params.id,
      attempt: Number(req.params.attempt),
      actor: actorOf(req),
    });

  /** POST `/:id/generations/:attempt/retry`: resumes a failed or cancelled generation at its first step not done. */
  static retryGeneration = async (req, res, options) =>
    await retryGeneration({
      models: workflowModels(options),
      id: req.params.id,
      attempt: Number(req.params.attempt),
      actor: actorOf(req),
    });

  /** GET `/:id/candidates/:revision`: one candidate with its package. */
  static candidate = async (req, res, options) =>
    await readCandidate(workflowModels(options), req.params.id, Number(req.params.revision));

  /** POST `/:id/candidates`: saves `{ package, parent }` as the next candidate. */
  static saveCandidate = async (req, res, options) =>
    await saveCandidate({ models: workflowModels(options), id: req.params.id, body: req.body, actor: actorOf(req) });

  /** POST `/:id/diff`: the differences of `{ package }` from the candidate `{ revision }`. */
  static diff = async (req, res, options) =>
    await diffCandidate({ models: workflowModels(options), id: req.params.id, body: req.body });

  /** POST `/:id/validate`: checks the candidate `{ revision }` against the content source. */
  static validate = async (req, res, options) =>
    await validateCandidate({
      models: workflowModels(options),
      id: req.params.id,
      revision: Number(req.body?.revision),
      actor: actorOf(req),
    });

  /** POST `/:id/apply`: writes the checked candidate `{ revision }` to the content source. */
  static apply = async (req, res, options) =>
    await applyCandidate({
      models: workflowModels(options),
      id: req.params.id,
      revision: Number(req.body?.revision),
      actor: actorOf(req),
    });

  /** PUT `/:id/exclusions`: leaves the report row `{ key }` out with a `reason`; an empty reason takes it back. */
  static exclusion = async (req, res, options) =>
    await setExclusion({ models: workflowModels(options), id: req.params.id, body: req.body, actor: actorOf(req) });

  /** GET `/:id/report?revision=`: the completeness report of a candidate, the newest by default. */
  static report = async (req, res, options) => {
    const models = workflowModels(options);
    const { semantic, exclusions, applied } = await candidateSemantic(models, req.params.id, req.query.revision);
    return await buildReport({ options, semantic, exclusions, applied });
  };
}

export { CyberiaSagaWorkflowService };
