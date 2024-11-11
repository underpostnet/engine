import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const NotificationService = {
  post: async (req, res, options) => {
    /** @type {import('./notification.model.js').NotificationModel} */
    const Notification = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Notification;
    return await new Notification(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./notification.model.js').NotificationModel} */
    const Notification = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Notification;
    return await Notification.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./notification.model.js').NotificationModel} */
    const Notification = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Notification;
    return await Notification.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./notification.model.js').NotificationModel} */
    const Notification = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Notification;
    return await Notification.findByIdAndDelete(req.params.id);
  },
};

export { NotificationService };
