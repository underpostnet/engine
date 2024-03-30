import { loggerFactory } from '../../server/logger.js';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
const logger = loggerFactory(import.meta);

const select = {
  'all-name': { _id: 1, name: 1, face: 1 },
};

const populateOptions = {
  path: 'face',
  select: 'fileId biome name type',
  // select: '-fileId -biome -name', // exclude
  options: { retainNullValues: true },
};

const CyberiaWorldService = {
  post: async (req, res, options) => {
    const { _id } = await new DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld(
      req.body,
    ).save();
    const [result] = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld.find({
      _id,
    })
      .select(select['all-name'])
      .populate(populateOptions);
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await DataBaseProvider.instance[
          `${options.host}${options.path}`
        ].mongoose.CyberiaWorld.find().populate(
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
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld.aggregate([
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
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld.find().select(
          select['all-name'],
        );
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.CyberiaWorld.find({
          _id: req.params.id,
        });
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
        result = await DataBaseProvider.instance[
          `${options.host}${options.path}`
        ].mongoose.CyberiaWorld.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { CyberiaWorldService };
