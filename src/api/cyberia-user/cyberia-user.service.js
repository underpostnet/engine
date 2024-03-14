import { loggerFactory } from '../../server/logger.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';

// import { Types } from 'mongoose';
// new Types.ObjectId()

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const CyberiaUserService = {
  post: async (req, res, options) => {
    let result = {};
    result = await new DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaUser(
      req.body,
    ).save();
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'auth':
        {
          const user = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaUser.find({
            'model.user._id': req.auth.user._id,
          });
          if (user[0]) result = user[0];
        }
        break;

      default:
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result = {};
    return result;
  },
  put: async (req, res, options) => {
    let result = {};
    return result;
  },
};

export { CyberiaUserService };
