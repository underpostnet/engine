import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import {
  CyberiaParams,
  getRandomAvailablePositionCyberia,
  isElementCollision,
} from '../../client/components/cyberia/CommonCyberia.js';
import dotenv from 'dotenv';
import { getCyberiaPortByWorldPath } from '../cyberia-world/cyberia-world.service.js';
import { CyberiaWsUserManagement } from '../../ws/cyberia/management/cyberia.ws.user.js';
import validator from 'validator';

dotenv.config();

// import { Types } from 'mongoose';
// new Types.ObjectId()
const logger = loggerFactory(import.meta);

const CyberiaUserService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaUser;

    /** @type {import('../cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaWorld;

    if (!req.body.model.user._id) throw new Error('User id is required');

    if (!req.body.model.world._id) req.body.model.world._id = options.cyberia.world.default._id;

    return await new CyberiaUser(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-user.model.js').CyberiaUserModel} */
    const CyberiaUser = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaUser;
    /** @type {import('../cyberia-world/cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaWorld;
    /** @type {import('../cyberia-biome/cyberia-biome.model.js').CyberiaBiomeModel} */
    const CyberiaBiome = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaBiome;

    switch (req.params.id) {
      case 'auth': {
        let userCyberia = await CyberiaUser.findOne({
          'model.user._id': req.auth.user._id,
        });

        if (!userCyberia) throw new Error('cyberia User not found');

        let userCyberiaWorld = await CyberiaWorld.findOne({ _id: userCyberia.model.world._id.toString() });

        if (!userCyberiaWorld) {
          userCyberiaWorld = options.cyberia.world.instance;
          const randomPosition = getRandomAvailablePositionCyberia({
            biomeData: options.cyberia.biome.instance[options.cyberia.world.instance.face[0].toString()],
            element: userCyberia,
          });
          const x = randomPosition.x;
          const y = randomPosition.y;
          userCyberia.model.world._id = options.cyberia.world.instance._id.toString();
          userCyberia.model.world.face = 1;
          userCyberia.x = x;
          userCyberia.y = y;
          await CyberiaUser.findByIdAndUpdate(
            userCyberia._id.toString(),
            { x, y, model: userCyberia.model },
            {
              runValidators: true,
            },
          );
          userCyberia = await CyberiaUser.findOne({
            'model.user._id': req.auth.user._id,
          });
        }

        if (userCyberia.model.world._id.toString() !== options.cyberia.world.instance._id.toString()) {
          let x, y, face;
          // const redirectPort = getCyberiaPortByWorldPath(options, `/${userCyberiaWorld._doc.name}`);
          const userCyberiaBiome = await CyberiaBiome.findOne({
            _id: userCyberiaWorld.face[userCyberia.model.world.face - 1],
          });
          const transportData =
            userCyberiaBiome &&
            userCyberiaBiome._doc.transports &&
            userCyberiaBiome._doc.transports.find((t) => {
              return (
                t.path === options.cyberia.world.instance.name &&
                isElementCollision({
                  A: {
                    dim: t.dim + CyberiaParams.DIM_AMPLITUDE_TRANSPORT_COLLISION,
                    x:
                      t.x1 / userCyberiaBiome._doc.dimPaintByCell - CyberiaParams.DIM_AMPLITUDE_TRANSPORT_COLLISION / 2,
                    y:
                      t.y1 / userCyberiaBiome._doc.dimPaintByCell - CyberiaParams.DIM_AMPLITUDE_TRANSPORT_COLLISION / 2,
                  },
                  B: userCyberia._doc,
                  dimPaintByCell: userCyberiaBiome._doc.dimPaintByCell,
                })
              );
            });
          if (
            transportData &&
            validator.isNumeric(`${transportData._doc.x2}`) &&
            validator.isNumeric(`${transportData._doc.y2}`)
          ) {
            x = transportData._doc.x2 / userCyberiaBiome._doc.dimPaintByCell;
            y = transportData._doc.y2 / userCyberiaBiome._doc.dimPaintByCell;
            face = transportData._doc.face;
          }

          if (req.auth.user.role !== 'admin' && req.auth.user.role !== 'moderator' && !transportData)
            return {
              redirect: `/${userCyberiaWorld._doc.name}`,
            };

          if (!validator.isNumeric(`${x}`) || !validator.isNumeric(`${y}`)) {
            const randomPosition = getRandomAvailablePositionCyberia({
              biomeData: options.cyberia.biome.instance[options.cyberia.world.instance.face[0].toString()],
              element: userCyberia,
            });
            x = randomPosition.x;
            y = randomPosition.y;
          }
          x = parseFloat(x);
          y = parseFloat(y);

          userCyberia.model.world._id = options.cyberia.world.instance._id.toString();
          userCyberia.model.world.face = face ? face : 1;
          userCyberia.x = x;
          userCyberia.y = y;
          const wsManagementId = `${options.host}${options.path}`;
          const socketId = CyberiaWsUserManagement.getCyberiaUserWsId(wsManagementId, userCyberia._id.toString());
          if (socketId) {
            CyberiaWsUserManagement.element[wsManagementId][socketId].model = userCyberia.model;
            CyberiaWsUserManagement.element[wsManagementId][socketId].x = x;
            CyberiaWsUserManagement.element[wsManagementId][socketId].y = y;
          }
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
    }
  },
  delete: async (req, res, options) => {},
  put: async (req, res, options) => {},
};

export { CyberiaUserService };
