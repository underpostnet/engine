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
  post: async (req, res, options) => {
    let result, user, _id, save, find, login;
    switch (req.params.id) {
      case 'auth':
        user = await UserModel.find({ email: req.body.email });
        if (user[0]) {
          login = await validatePassword(req.body.password, user[0].password);
          if (login === true) {
            result = {
              token: getToken({ user: user[0] }),
              user: await UserModel.find({ _id: user[0]._id.toString() }).select(select['auth'])[0],
            };
          }
        }
        break;

      default:
        req.body.password = await getPasswordHash(req.body.password);
        req.body.role = 'user';
        save = await new UserModel(req.body).save();
        _id = save._id;
        find = await UserModel.find({ _id }).select(select['auth']);
        user = find[0];
        result = {
          token: getToken({ user }),
          user,
        };
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await UserModel.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      case 'auth':
        logger.error(req.auth);
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
