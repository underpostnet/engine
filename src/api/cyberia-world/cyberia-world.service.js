import { loggerFactory } from '../../server/logger.js';
import { CyberiaWorldModel } from './cyberia-world.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  'all-name': { _id: 1, name: 1, face: 1 },
};

const CyberiaWorldService = {
  post: async (req, res, options) => {
    const { _id } = await new CyberiaWorldModel(req.body).save();
    const [result] = await CyberiaWorldModel.find({ _id })
      .select(select['all-name'])
      .populate('face', { fileId: 1, biome: 1, name: 1 });
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        result = await CyberiaWorldModel.find().populate(
          {
            path: 'face',
            select: 'fileId biome name',
            // select: '-fileId -biome -name', // exclude
            options: { retainNullValues: true },
          },
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
        result = await CyberiaWorldModel.aggregate([
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
        result = await CyberiaWorldModel.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      default:
        result = await CyberiaWorldModel.find({ _id: req.params.id });
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
        result = await CyberiaWorldModel.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
};

export { CyberiaWorldService };
