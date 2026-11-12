import { DataBaseProviderService } from '../../db/database-provider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { revisionGuard } from '../../server/storage/revision.js';

const logger = loggerFactory(import.meta);
const httpError = (status, message) => Object.assign(new Error(message), { status });

// A step may not repeat the same (type, itemId) objective combination.
const validateQuestObjectives = (body) => {
  for (const [stepIndex, step] of (body?.steps || []).entries()) {
    const seen = new Set();
    for (const objective of step?.objectives || []) {
      const key = `${objective?.type}::${objective?.itemId}`;
      if (seen.has(key))
        throw new Error(
          `Duplicate objective "${objective?.type}" for itemId "${objective?.itemId}" in step ${stepIndex + 1}.`,
        );
      seen.add(key);
    }
  }
};

class CyberiaQuestService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    validateQuestObjectives(req.body);
    const { revision, ...fields } = req.body ?? {};
    return await new CyberiaQuest(fields).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    if (req.params.id) return await CyberiaQuest.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaQuest.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaQuest.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static getByCode = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    const { code } = req.params;
    if (!code) throw new Error('code parameter is required');
    const data = await CyberiaQuest.findOne({ code }).lean();
    if (data) return data;
    throw new Error(`No quest found for code: ${code}`);
  };
  // Quest OFFERS are located by the quest's own (sourceMapCode, sourceCellX,
  // sourceCellY). The client queries this with the interacted entity's binding
  // cell — no dependency on CyberiaAction. Full docs are returned so the client
  // populates its quest metadata cache in a single request.
  static getByCell = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    const { mapCode } = req.params;
    const cellX = parseInt(req.params.cellX);
    const cellY = parseInt(req.params.cellY);
    if (!mapCode || Number.isNaN(cellX) || Number.isNaN(cellY))
      throw new Error('mapCode, cellX and cellY parameters are required');
    return await CyberiaQuest.find({ sourceMapCode: mapCode, sourceCellX: cellX, sourceCellY: cellY }).lean();
  };
  /** The body names the revision it read; a field it leaves out stays as stored. */
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    validateQuestObjectives(req.body);
    const stored = await CyberiaQuest.findById(req.params.id).lean();
    if (!stored) throw httpError(404, 'quest not found');
    const { _id, revision, createdAt, updatedAt, __v, ...changes } = req.body ?? {};
    const read = stored.revision ?? 1;
    if (revision !== read)
      throw httpError(409, `Quest ${stored.code} is at revision ${read}, not ${revision}: reload it`);
    const { filter, next } = revisionGuard(stored);
    const updated = await CyberiaQuest.findOneAndUpdate(
      filter,
      { $set: { ...changes, revision: next } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) throw httpError(409, `Quest ${stored.code} changed while saving: reload it`);
    return updated;
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    if (req.params.id) return await CyberiaQuest.findByIdAndDelete(req.params.id);
    else return await CyberiaQuest.deleteMany();
  };
}

export { CyberiaQuestService };
