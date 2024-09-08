import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const EventSchedulerService = {
  post: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.EventScheduler;
    return await new EventScheduler({ ...req.body, creatorUserId: req.auth.user._id }).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.EventScheduler;
    if (req.params.id) return await EventScheduler.findById(req.params.id);
    return await EventScheduler.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.EventScheduler;
    return await EventScheduler.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.EventScheduler;
    if (req.params.id) return await EventScheduler.findByIdAndDelete(req.params.id);
    else return await await EventScheduler.deleteMany();
  },
};

export { EventSchedulerService };
