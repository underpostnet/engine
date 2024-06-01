import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import dotenv from 'dotenv';
import { networkRouter } from '../../server/network.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const getCyberiaPortByWorldPath = (options = { host: '' }, pathWorld = '') =>
  process.env.NODE_ENV === 'development' &&
  networkRouter[options.host] &&
  networkRouter[options.host][pathWorld] &&
  networkRouter[options.host][pathWorld].port
    ? `:${networkRouter[options.host][pathWorld].port}`
    : ``;

const select = {
  'all-name': { _id: 1, name: 1, face: 1, type: 1 },
};

const populateOptions = {
  path: 'face',
  select: 'fileId biome name type',
  // select: '-fileId -biome -name', // exclude
  options: { retainNullValues: true },
};

const CyberiaWorldService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld;

    const { _id } = await new CyberiaWorld(req.body).save();
    const [result] = await CyberiaWorld.find({
      _id,
    })
      .select(select['all-name'])
      .populate(populateOptions);
    return result;
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld;
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await CyberiaWorld.find().populate(
          populateOptions,
          // 'face',
          // {
          //   fileId: 1,
          //   biome: 1,
          //   name: 1,
          // },
        );
        break;
      case 'all-test':
        // preserveNullAndEmptyArrays
        result = await CyberiaWorld.aggregate([
          {
            $lookup: {
              from: 'cyberiabiomes', // collection name
              localField: 'face',
              foreignField: '_id',
              as: 'face',
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              face: {
                $map: {
                  input: '$face',
                  as: 'faceItem',
                  in: {
                    $cond: {
                      if: { $eq: ['$$faceItem', null] },
                      then: '$$faceItem',
                      else: {
                        _id: '$$faceItem._id',
                        fileId: '$$faceItem.fileId',
                        biome: '$$faceItem.biome',
                      },
                    },
                  },
                },
              },
              // 'face._id': 1,
              // 'face.fileId': 1,
              // 'face.biome': 1,
            },
          },
        ]);

        break;
      case 'all-name':
        result = await CyberiaWorld.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await CyberiaWorld.find({
          _id: options.cyberia.world.instance._id.toString(),
        });
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-world.model.js').CyberiaWorldModel} */
    const CyberiaWorld = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld;
    let result = {};
    switch (req.params.id) {
      case 'all':
        break;

      default:
        result = await CyberiaWorld.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { CyberiaWorldService, getCyberiaPortByWorldPath };
