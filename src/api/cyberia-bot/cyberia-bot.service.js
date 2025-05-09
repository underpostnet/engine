import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { CyberiaWsBotManagement } from '../../ws/cyberia/management/cyberia.ws.bot.js';

const logger = loggerFactory(import.meta);

const CyberiaBotService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-bot.model.js').CyberiaBotModel} */
    const CyberiaBot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBot;
    return await new CyberiaBot(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-bot.model.js').CyberiaBotModel} */
    const CyberiaBot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBot;
    if (req.path.startsWith('/display-id'))
      return await CyberiaWsBotManagement.findOneByDisplayId(`${options.host}${options.path}`, req.params.id);
    return await CyberiaBot.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-bot.model.js').CyberiaBotModel} */
    const CyberiaBot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBot;
    return await CyberiaBot.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-bot.model.js').CyberiaBotModel} */
    const CyberiaBot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBot;
    return await CyberiaBot.findByIdAndDelete(req.params.id);
  },
};

export { CyberiaBotService };
