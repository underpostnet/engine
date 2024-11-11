import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const UserGroupService = {
  post: async (req, res, options) => {
    /** @type {import('./user-group.model.js').UserGroupModel} */
    const UserGroup = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.UserGroup;
    return await new UserGroup(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./user-group.model.js').UserGroupModel} */
    const UserGroup = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.UserGroup;
    return await UserGroup.findById(req.params.id);
  },
  put: async (req, res, options) => {
    /** @type {import('./user-group.model.js').UserGroupModel} */
    const UserGroup = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.UserGroup;
    return await UserGroup.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./user-group.model.js').UserGroupModel} */
    const UserGroup = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.UserGroup;
    return await UserGroup.findByIdAndDelete(req.params.id);
  },
};

export { UserGroupService };
