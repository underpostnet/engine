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
              behavior: { type: String, enum: ['user-hostile', 'quest-passive', 'item-quest', 'pet'] },
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
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            behavior: 'quest-passive',
            displayIds: [
              { id: 'agent', quantity: [1] },
              { id: 'punk', quantity: [1] },
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
              { id: 'agent', quantity: [1] },
              { id: 'punk', quantity: [1] },
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
    ],
  },
  type: { type: String, enum: ['width', 'height'], default: 'width' },
  name: { type: String },
});

const CyberiaWorldModel = model('CyberiaWorld', CyberiaWorldSchema);

const ProviderSchema = CyberiaWorldSchema;

export { CyberiaWorldSchema, CyberiaWorldModel, ProviderSchema };
