import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { getRandomAvailablePositionCyberia } from '../../client/components/cyberia/CommonCyberia.js';
import dotenv from 'dotenv';
import { getCyberiaPortByWorldPath } from '../cyberia-world/cyberia-world.service.js';

dotenv.config();

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
    /** @type {import('../cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld;
    let result = {};
    switch (req.params.id) {
      case 'auth': {
        const userCyberia = await CyberiaUser.findOne({
          'model.user._id': req.auth.user._id,
        });

        const userCyberiaWorld = await CyberiaWorld.findOne({ _id: userCyberia.model.world._id.toString() });

        if (userCyberia.model.world._id.toString() !== options.cyberia.world.instance._id.toString()) {
          // const redirectPort = getCyberiaPortByWorldPath(options, `/${userCyberiaWorld._doc.name}`);
          if (req.auth.user.role !== 'admin' && req.auth.user.role !== 'moderator') {
            result = {
              redirect: `/${userCyberiaWorld._doc.name}`,
            };
            return result;
          }

          userCyberia.model.world._id = options.cyberia.world.instance._id.toString();
          userCyberia.model.world.face = 1;
          const { x, y } = getRandomAvailablePositionCyberia({
            biomeData: options.cyberia.biome.instance[options.cyberia.world.instance.face[0].toString()],
            element: userCyberia,
          });
          userCyberia.x = x;
          userCyberia.y = y;
          await CyberiaUser.findByIdAndUpdate(
            userCyberia._id.toString(),
            { x, y, model: userCyberia.model },
            {
              runValidators: true,
            },
          );
        }

        return userCyberia;
      }

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
