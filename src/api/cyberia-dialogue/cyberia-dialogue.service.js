import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { contentArtifact } from '../../projects/cyberia/content-artifact.js';

const logger = loggerFactory(import.meta);

class CyberiaDialogueService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProviderService.getModel("CyberiaDialogue", options);
    return await new CyberiaDialogue(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProviderService.getModel("CyberiaDialogue", options);
    if (req.params.id) return await CyberiaDialogue.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaDialogue.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaDialogue.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProviderService.getModel("CyberiaDialogue", options);
    return await CyberiaDialogue.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProviderService.getModel("CyberiaDialogue", options);
    if (req.params.id) return await CyberiaDialogue.findByIdAndDelete(req.params.id);
    else return await CyberiaDialogue.deleteMany();
  };
  static getByCode = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProviderService.getModel("CyberiaDialogue", options);
    const { code } = req.params;
    if (!code) throw new Error('code parameter is required');
    const data = await CyberiaDialogue.find({ code }).sort({ order: 1 }).lean();
    if (data.length) return data;
    // An item with no stored dialogue speaks the flavor text of its definition.
    const flavor = contentArtifact().foundation.dialogues.filter((d) => d.code === code);
    if (flavor.length) return flavor;
    throw new Error(`No dialogue found for code: ${code}`);
  };
}

export { CyberiaDialogueService };
