import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';

// import { Types } from 'mongoose';
// new Types.ObjectId()
const logger = loggerFactory(import.meta);

const CyberiaUserService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaUser;
    let result = {};
    result = await new CyberiaUser(req.body).save();
    return result;
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaUser;
    let result = {};
    switch (req.params.id) {
      case 'auth':
        {
          const user = await CyberiaUser.find({
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
