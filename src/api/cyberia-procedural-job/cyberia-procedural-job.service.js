/**
 * CyberiaProceduralJob service: the Procedural Engine API. A request creates a persistent job and
 * returns it at once; the background worker generates the items, and a moderator reviews them.
 *
 * @module src/api/cyberia-procedural-job/cyberia-procedural-job.service.js
 * @namespace CyberiaProceduralJobService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CyberiaProceduralJobDto } from './cyberia-procedural-job.model.js';
import { CyberiaProceduralJobItemDto } from '../cyberia-procedural-job-item/cyberia-procedural-job-item.model.js';
import { cancelJob, deleteJob, proceduralModels, requestError } from '../../projects/cyberia/procedural/engine.js';
import { createJob } from '../../projects/cyberia/procedural/jobs/job.js';
import { promoteItem, promoteJob } from '../../projects/cyberia/procedural/jobs/promotion.js';
import { reloadContentServers } from '../../projects/cyberia/content/content-release.js';
import { listSources } from '../../projects/cyberia/procedural/source.js';
import { paletteDefaults } from '../../projects/cyberia/procedural/spec.js';
import {
  approveItem,
  itemProvenance,
  openForEdit,
  regenerateItem,
  rejectItem,
} from '../../projects/cyberia/procedural/jobs/review.js';

const actorOf = (req) => String(req.auth.user._id);
const reasonOf = (req) => String(req.body?.reason ?? '');

/** Refuses a promotion or a delete of the job of a map population stage: its population owns them. */
async function assertItemGeneration({ CyberiaProceduralJob }, jobId) {
  const job = await CyberiaProceduralJob.findById(jobId, { populationId: 1 }).lean();
  if (job?.populationId)
    throw requestError(
      `Job ${jobId} runs a stage of map population ${job.populationId}: act through the population`,
      409,
    );
}

class CyberiaProceduralJobService {
  /**
   * POST `/`: creates the job of a generation request of one of the two modes, or returns the one an
   * equal spec created.
   * @param {Object} req - Express request with body `{ mode, source | itemType, template, palette, output, variation, seed }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The job.
   */
  static post = async (req, res, options) =>
    await createJob({ models: proceduralModels(options), request: req.body, actor: actorOf(req) });

  /**
   * GET `/sources` (paginated): the existing items an update can target, with their art direction.
   * @param {Object} req - Express request; `filterModel` and `sortModel` apply to the item fields.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static sources = async (req, res, options) => {
    const page = DataQuery.parse(req.query);
    const { data, total } = await listSources(proceduralModels(options), page);
    return { data, total, page: page.page, totalPages: Math.ceil(total / page.limit) };
  };

  /**
   * GET `/sources/:itemId/palette`: the palette an update starts from for one item, under the
   * palette `?paletteId=` names, from the Genesis Template with `?fromTemplate=true`, on the
   * template `?templateId=` names when it fits.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{templateId:string,palettes:Object[],slots:Object}>}
   */
  static sourcePalette = async (req, res, options) =>
    await paletteDefaults(proceduralModels(options), {
      itemId: req.params.itemId,
      paletteId: req.query.paletteId,
      templateId: req.query.templateId ? String(req.query.templateId) : '',
      fromTemplate: req.query.fromTemplate === 'true',
    });

  /**
   * GET `/` (paginated: the item generations, without the stage jobs of a map population) or
   * `/:jobId` (one job with its persisted counts).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const CyberiaProceduralJob = DataBaseProviderService.getModel('CyberiaProceduralJob', options);
    const select = CyberiaProceduralJobDto.select.get();
    if (req.params.jobId) {
      const job = await CyberiaProceduralJob.findById(req.params.jobId).select(select);
      if (!job) throw requestError('Job not found', 404);
      return job;
    }
    const { query, sort, skip, limit, page } = DataQuery.parse({ ...req.query, query: { populationId: null } });
    const [data, total] = await Promise.all([
      CyberiaProceduralJob.find(query)
        .sort(Object.keys(sort).length > 0 ? sort : { createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select(select),
      CyberiaProceduralJob.countDocuments(query),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };

  /**
   * GET `/:jobId/items` (paginated; `filterModel` and `sortModel` apply) or `/:jobId/items/:itemId`
   * (one candidate with its job and audit trail).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static getItems = async (req, res, options) => {
    const models = proceduralModels(options);
    if (req.params.itemId) return await itemProvenance(models, req.params.jobId, req.params.itemId);
    const { CyberiaProceduralJobItem } = models;
    const { query, sort, skip, limit, page } = DataQuery.parse({ ...req.query, query: { jobId: req.params.jobId } });
    const [data, total] = await Promise.all([
      CyberiaProceduralJobItem.find(query)
        .sort(Object.keys(sort).length > 0 ? sort : { ordinal: 1 })
        .limit(limit)
        .skip(skip)
        .select(CyberiaProceduralJobItemDto.select.get()),
      CyberiaProceduralJobItem.countDocuments(query),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };

  /**
   * POST `/:jobId/cancel`: stops the generation of a job.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The job.
   */
  static cancel = async (req, res, options) =>
    await cancelJob({
      models: proceduralModels(options),
      jobId: req.params.jobId,
      actor: actorOf(req),
      reason: reasonOf(req),
    });

  /**
   * DELETE `/:jobId`: stops a job if it still works, then removes it and everything it left.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{stopped:number,candidates:number,drafts:number,audit:number}>}
   */
  static delete = async (req, res, options) => {
    const models = proceduralModels(options);
    await assertItemGeneration(models, req.params.jobId);
    return await deleteJob({ models, jobId: req.params.jobId, options });
  };

  /**
   * POST `/:jobId/items/:itemId/regenerate`: queues the item for a new generation.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The item.
   */
  static regenerate = async (req, res, options) =>
    await regenerateItem({
      models: proceduralModels(options),
      jobId: req.params.jobId,
      id: req.params.itemId,
      actor: actorOf(req),
      reason: reasonOf(req),
    });

  /**
   * POST `/:jobId/items/:itemId/approve`: approves the revision `{ cid }` names.
   * @param {Object} req - Express request with body `{ cid, reason? }`.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The item.
   */
  static approve = async (req, res, options) =>
    await approveItem({
      models: proceduralModels(options),
      jobId: req.params.jobId,
      id: req.params.itemId,
      cid: req.body?.cid,
      actor: actorOf(req),
      reason: reasonOf(req),
    });

  /**
   * POST `/:jobId/items/:itemId/reject`: rejects the current revision.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The item.
   */
  static reject = async (req, res, options) =>
    await rejectItem({
      models: proceduralModels(options),
      jobId: req.params.jobId,
      id: req.params.itemId,
      actor: actorOf(req),
      reason: reasonOf(req),
    });

  /**
   * POST `/:jobId/items/:itemId/edit`: opens the item for a visual edit in the Object Layer Studio.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The review context the Studio opens.
   */
  static edit = async (req, res, options) =>
    await openForEdit({
      models: proceduralModels(options),
      jobId: req.params.jobId,
      id: req.params.itemId,
      actor: actorOf(req),
    });

  /**
   * POST `/:jobId/items/:itemId/promote`: promotes the approved candidate to its target item, then
   * asks the game servers to reload their object layers without waiting for them.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The item.
   */
  static promote = async (req, res, options) => {
    const models = proceduralModels(options);
    await assertItemGeneration(models, req.params.jobId);
    const item = await promoteItem({
      models,
      jobId: req.params.jobId,
      id: req.params.itemId,
      actor: actorOf(req),
      options,
    });
    void reloadContentServers(options, { mode: 'incremental' });
    return item;
  };

  /**
   * POST `/:jobId/promote`: promotes the approved candidates of a job; the game servers reload
   * their object layers once when any was promoted.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{promoted:string[],failed:Array<{targetItemId:string,message:string}>}>}
   */
  static promoteJob = async (req, res, options) => {
    const models = proceduralModels(options);
    await assertItemGeneration(models, req.params.jobId);
    const result = await promoteJob({
      models,
      jobId: req.params.jobId,
      actor: actorOf(req),
      options,
    });
    if (result.promoted.length > 0) void reloadContentServers(options, { mode: 'incremental' });
    return result;
  };
}

export { CyberiaProceduralJobService };
