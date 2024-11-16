import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaWorldSchema = new Schema({
  face: [
    {
      type: Schema.Types.ObjectId,
      ref: 'CyberiaBiome',
    },
  ],
  instance: {
    type: [
      {
        type: { type: String, enum: ['pvp', 'pve'] },
        bots: {
          type: [
            {
              behavior: {
                type: String,
                enum: ['user-hostile', 'quest-passive', 'item-quest', 'pet', 'generic-people'],
              },
              displayIds: [
                {
                  id: { type: String },
                  quantity: [{ type: Number }],
                  name: { type: String },
                  title: { type: String },
                  parentId: { type: String },
                },
              ],
            },
          ],
        },
      },
    ],
    default: [
      {
        type: 'pve',
        bots: [
          {
            behavior: 'quest-passive',
            displayIds: [{ id: 'ayleen', quantity: [1] }],
          },
          {
            behavior: 'pet',
            displayIds: [
              {
                id: 'dog',
                quantity: [1],
                name: 'floki',
                title: `ayleen's dog`,
                parentId: 'ayleen',
              },
            ],
          },
          {
            behavior: 'item-quest',
            displayIds: [
              { id: 'bone', quantity: [2] },
              { id: 'bone-brown', quantity: [1] },
            ],
          },
          {
            behavior: 'user-hostile',
            displayIds: [
              { id: 'purple', quantity: [4, 7] },
              { id: 'kishins', quantity: [2, 5] },
            ],
          },
          {
            behavior: 'generic-people',
            displayIds: [
              { id: 'gp0', quantity: [1] },
              { id: 'gp1', quantity: [1] },
            ],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            behavior: 'quest-passive',
            displayIds: [
              {
                id: 'agent',
                quantity: [1],
                title: `SCP Agent`,
                name: 'Kinoshita',
              },
              { id: 'punk', quantity: [1] },
              { id: 'scp-2040', quantity: [1], title: `SCP`, name: '2040' },
            ],
          },
          {
            behavior: 'user-hostile',
            displayIds: [
              { id: 'purple', quantity: [4, 7] },
              { id: 'kishins', quantity: [2, 5] },
            ],
          },
          {
            behavior: 'item-quest',
            displayIds: [
              { id: 'bone', quantity: [2] },
              { id: 'bone-brown', quantity: [1] },
            ],
          },
          {
            behavior: 'generic-people',
            displayIds: [{ id: 'marciano', quantity: [1] }],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            behavior: 'user-hostile',
            displayIds: [
              { id: 'purple', quantity: [4, 7] },
              { id: 'kishins', quantity: [2, 5] },
            ],
          },
          {
            behavior: 'item-quest',
            displayIds: [
              { id: 'bone', quantity: [2] },
              { id: 'bone-brown', quantity: [1] },
            ],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            behavior: 'user-hostile',
            displayIds: [
              { id: 'purple', quantity: [4, 7] },
              { id: 'kishins', quantity: [2, 5] },
            ],
          },
          {
            behavior: 'item-quest',
            displayIds: [
              { id: 'bone', quantity: [2] },
              { id: 'bone-brown', quantity: [1] },
            ],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            behavior: 'user-hostile',
            displayIds: [
              { id: 'purple', quantity: [4, 7] },
              { id: 'kishins', quantity: [2, 5] },
            ],
          },
          {
            behavior: 'item-quest',
            displayIds: [
              { id: 'bone', quantity: [2] },
              { id: 'bone-brown', quantity: [1] },
            ],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            behavior: 'quest-passive',
            displayIds: [
              {
                id: 'agent',
                quantity: [1],
                title: `SCP Agent`,
                name: 'Kinoshita',
              },
              { id: 'punk', quantity: [1] },
              { id: 'scp-2040', quantity: [1], title: `SCP`, name: '2040' },
            ],
          },
          {
            behavior: 'user-hostile',
            displayIds: [
              { id: 'purple', quantity: [4, 7] },
              { id: 'kishins', quantity: [2, 5] },
            ],
          },
          {
            behavior: 'item-quest',
            displayIds: [
              { id: 'bone', quantity: [2] },
              { id: 'bone-brown', quantity: [1] },
            ],
          },
          {
            behavior: 'generic-people',
            displayIds: [{ id: 'marciano', quantity: [1] }],
          },
        ],
      },
    ],
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
