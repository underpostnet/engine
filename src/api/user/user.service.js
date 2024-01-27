import { loggerFactory } from '../../server/logger.js';
import { UserModel } from './user.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { getPasswordHash, getToken, validatePassword } from '../../server/auth.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  'all-name': { _id: 1, name: 1 },
  auth: { _id: 1, username: 1, email: 1, role: 1 },
};

const UserService = {
  auth: async (req, res, options) => {
    const user = await UserModel.find({ email: req.body.email });
    let result;
    if (user[0]) {
      const login = await validatePassword(req.body.password, user[0].password);
      if (login === true) {
        result = {
          token: getToken({ user: user[0] }),
          user: await UserModel.find({ _id: user[0]._id.toString() }).select(select['auth'])[0],
        };
      }
    }
    return result;
  },
  post: async (req, res, options) => {
    req.body.password = await getPasswordHash(req.body.password);
    req.body.role = 'user';
    const { _id } = await new UserModel(req.body).save();
    const [user] = await UserModel.find({ _id }).select(select['auth']);
    return {
      token: getToken({ user }),
      user,
    };
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await UserModel.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      case 'auth':
        result = await UserModel.find({ _id: req.auth.user._id }).select(select['auth']);
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
