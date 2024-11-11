import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const BotService = {
  post: async (req, res, options) => {
    /** @type {import('./bot.model.js').BotModel} */
    const Bot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Bot;
    return await new Bot(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./bot.model.js').BotModel} */
    const Bot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Bot;
    return await Bot.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./bot.model.js').BotModel} */
    const Bot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Bot;
    return await Bot.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./bot.model.js').BotModel} */
    const Bot = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Bot;
    return await Bot.findByIdAndDelete(req.params.id);
  },
};

export { BotService };
