import { Schema, model } from 'mongoose';
import { CyberiaInstanceSchema } from '../cyberia-instance/cyberia-instance.model.js';
import { CyberiaInstancesStructs } from '../../client/components/cyberia/CommonCyberia.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaWorldSchema = new Schema({
  face: [
    {
      type: Schema.Types.ObjectId,
      ref: 'CyberiaBiome',
    },
  ],
  instance: {
    type: [CyberiaInstanceSchema],
    default: CyberiaInstancesStructs.default,
  },
  quests: {
    type: [
      {
        id: { type: String },
      },
    ],
    default: [
      {
        id: 'floki-bone',
      },
      {
        id: 'scp-2040-dialog',
      },
      {
        id: 'subkishins-0',
      },
    ],
  },
  type: { type: String, enum: ['width', 'height'], default: 'width' },
  name: { type: String },
  adjacentFace: {
    type: { type: String },
    value: { type: String },
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },
  },
});

const CyberiaWorldModel = model('CyberiaWorld', CyberiaWorldSchema);

const ProviderSchema = CyberiaWorldSchema;

const CyberiaWorldAggregateDto = {
  get: () => {
    return [
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
    ];
  },
};

const CyberiaWorldPopulateDto = {
  get: () => {
    return {
      path: 'face',
      select: 'fileId biome name type',
      // select: '-fileId -biome -name', // exclude
      options: { retainNullValues: true },
    };
  },
};

const CyberiaWorldSelectDto = {
  get: () => {
    return { _id: 1, name: 1, face: 1, type: 1 };
  },
};

const CyberiaWorldDto = {
  select: CyberiaWorldSelectDto,
  populate: CyberiaWorldPopulateDto,
  aggregate: CyberiaWorldAggregateDto,
};

export {
  CyberiaWorldSchema,
  CyberiaWorldModel,
  ProviderSchema,
  CyberiaWorldDto,
  CyberiaWorldAggregateDto,
  CyberiaWorldPopulateDto,
  CyberiaWorldSelectDto,
};
