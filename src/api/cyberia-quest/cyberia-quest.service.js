import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';
import { DefaultCyberiaQuests } from '../cyberia-server-defaults/cyberia-server-defaults.js';

const logger = loggerFactory(import.meta);

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
    return await new CyberiaQuest(req.body).save();
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
    // Fallback world delivers quests to the Go server via gRPC from the
    // canonical defaults without persisting them. Serve those same defaults so
    // the client can resolve metadata even when Mongo has no seeded quest.
    const fallback = DefaultCyberiaQuests.find((q) => q.code === code);
    if (fallback) return fallback;
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
    const docs = await CyberiaQuest.find({ sourceMapCode: mapCode, sourceCellX: cellX, sourceCellY: cellY }).lean();
    const seen = new Set(docs.map((d) => d.code));
    // Fallback-world quests are served from the canonical defaults, not Mongo.
    for (const q of DefaultCyberiaQuests) {
      if (q.sourceMapCode === mapCode && q.sourceCellX === cellX && q.sourceCellY === cellY && !seen.has(q.code)) {
        docs.push(q);
        seen.add(q.code);
      }
    }
    return docs;
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    validateQuestObjectives(req.body);
    return await CyberiaQuest.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-quest.model.js').CyberiaQuestModel} */
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    if (req.params.id) return await CyberiaQuest.findByIdAndDelete(req.params.id);
    else return await CyberiaQuest.deleteMany();
  };
}

export { CyberiaQuestService };
