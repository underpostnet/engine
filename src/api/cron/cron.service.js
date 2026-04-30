import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

class CronService {
  static post = async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    return await new Cron(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    if (req.params.id) return await Cron.findById(req.params.id);
    const { page = 1, limit = 10, sort = { updatedAt: -1 } } = req.query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Cron.find({}).sort(sort).limit(limit).skip(skip),
      Cron.countDocuments({}),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    return await Cron.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cron.model.js').CronModel} */
    const Cron = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Cron;
    if (req.params.id) return await Cron.findByIdAndDelete(req.params.id);
    else return await Cron.deleteMany();
  };
}

export { CronService };
