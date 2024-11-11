import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const CronService = {
  post: async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    return await new Cron(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    if (req.params.id) return await Cron.findById(req.params.id);
    return await Cron.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    return await Cron.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    if (req.params.id) return await Cron.findByIdAndDelete(req.params.id);
    else return await await Cron.deleteMany();
  },
};

export { CronService };
