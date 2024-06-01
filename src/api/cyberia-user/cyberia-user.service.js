import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { BaseElement, WorldCyberiaType } from '../../client/components/cyberia/CommonCyberia.js';
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
      case 'auth':
        {
          const user = await CyberiaUser.find({
            'model.user._id': req.auth.user._id,
          });

          let userWorldId = user[0].model.world._id.toString();

          const userWorld = await CyberiaWorld.findById(userWorldId);
          if (!userWorld) {
            userWorldId = options.cyberia.world.default._id();
            const baseElement = BaseElement({ worldId: userWorldId }).user.main;
            user[0].model.world = baseElement.model.world;
            user[0].x = baseElement.x;
            user[0].y = baseElement.y;
            const result = await CyberiaUser.findByIdAndUpdate(user[0]._id.toString(), user[0], {
              runValidators: true,
            });
          }

          if (userWorldId !== options.cyberia.world.instance._id.toString()) {
            // const redirectPort = getCyberiaPortByWorldPath(options, `/${userWorld._doc.name}`);
            result = {
              redirect: `/${userWorld._doc.name}`,
            };
            return result;
          }

          if (!WorldCyberiaType[options.cyberia.world.instance.type].worldFaces.includes(user[0].model.world.face)) {
            user[0].model.world.face = 1;
            const result = await CyberiaUser.findByIdAndUpdate(
              user[0]._id.toString(),
              { model: user[0].model },
              {
                runValidators: true,
              },
            );
          }

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
