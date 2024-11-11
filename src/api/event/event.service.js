import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const EventService = {
  post: async (req, res, options) => {
    /** @type {import('./event.model.js').EventModel} */
    const Event = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Event;
    return await new Event(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./event.model.js').EventModel} */
    const Event = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Event;
    return await Event.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./event.model.js').EventModel} */
    const Event = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Event;
    return await Event.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./event.model.js').EventModel} */
    const Event = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Event;
    return await Event.findByIdAndDelete(req.params.id);
  },
};

export { EventService };
