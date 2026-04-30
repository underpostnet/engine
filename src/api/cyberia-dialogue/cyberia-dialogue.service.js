import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaDialogueService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaDialogue;
    return await new CyberiaDialogue(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaDialogue;
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
    const CyberiaDialogue = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaDialogue;
    return await CyberiaDialogue.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaDialogue;
    if (req.params.id) return await CyberiaDialogue.findByIdAndDelete(req.params.id);
    else return await CyberiaDialogue.deleteMany();
  };
  static getByItemId = async (req, res, options) => {
    /** @type {import('./cyberia-dialogue.model.js').CyberiaDialogueModel} */
    const CyberiaDialogue = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaDialogue;
    const { itemId } = req.params;
    if (!itemId) throw new Error('itemId parameter is required');
    const data = await CyberiaDialogue.find({ itemId }).sort({ order: 1 }).lean();
    if (!data.length) throw new Error(`No dialogue found for itemId: ${itemId}`);
    return data;
  };
}

export { CyberiaDialogueService };
