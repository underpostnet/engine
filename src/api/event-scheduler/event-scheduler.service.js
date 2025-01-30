import { strToDateUTC } from '../../client/components/core/CommonJs.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const EventSchedulerService = {
  post: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.EventScheduler;

    if (req.body.startTime || req.body.endTime) {
      delete req.body.start;
      delete req.body.end;
    } else {
      req.body.start = strToDateUTC(req.body.start);
      req.body.end = strToDateUTC(req.body.end);
    }

    return await new EventScheduler({ ...req.body, creatorUserId: req.auth.user._id }).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.EventScheduler;
    if (req.path.startsWith('/creatorUser')) {
      return await EventScheduler.find({ creatorUserId: req.params.id ? req.params.id : req.auth.user._id });
    }
    if (req.params.id) return await EventScheduler.findById(req.params.id);
    return await EventScheduler.find();
  },
  put: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.EventScheduler;

    if (req.body.startTime || req.body.endTime) {
      delete req.body.start;
      delete req.body.end;
    } else {
      req.body.start = strToDateUTC(req.body.start);
      req.body.end = strToDateUTC(req.body.end);
    }

    await EventScheduler.findByIdAndUpdate(req.params.id, req.body);
    return await EventScheduler.findOne({ _id: req.params.id });
  },
  delete: async (req, res, options) => {
    /** @type {import('./event-scheduler.model.js').EventSchedulerModel} */
    const EventScheduler = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.EventScheduler;
    if (req.params.id) return await EventScheduler.findByIdAndDelete(req.params.id);
    else return await await EventScheduler.deleteMany();
  },
};

export { EventSchedulerService };
