import { loggerFactory } from '../../server/logger.js';
import { UserModel } from './user.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { getPasswordHash } from '../../server/auth.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  'all-name': { _id: 1, name: 1 },
};

const UserService = {
  post: async (req, res, options) => {
    req.body.password = await getPasswordHash(req.body.password);
    req.body.role = 'user';
    const { _id } = await new UserModel(req.body).save();
    const [result] = await UserModel.find({ _id }).select(select['all-name']);
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await UserModel.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await UserModel.find({ _id: req.params.id });
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        break;

      default:
        result = await UserModel.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { UserService };
