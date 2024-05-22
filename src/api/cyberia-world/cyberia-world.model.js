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
              min: { type: Number },
              max: { type: Number },
              type: { type: String, enum: ['user-hostile', 'quest-passive'] },
              displayIds: [{ type: String }],
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
            min: 3,
            max: 3,
            type: 'quest-passive',
            displayIds: ['agent', 'ayleen', 'punk'],
          },
          {
            min: 5,
            max: 10,
            type: 'user-hostile',
            displayIds: ['purple', 'kishins'],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            min: 5,
            max: 10,
            type: 'user-hostile',
            displayIds: ['purple', 'kishins'],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            min: 5,
            max: 10,
            type: 'user-hostile',
            displayIds: ['purple', 'kishins'],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            min: 5,
            max: 10,
            type: 'user-hostile',
            displayIds: ['purple', 'kishins'],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            min: 5,
            max: 10,
            type: 'user-hostile',
            displayIds: ['purple', 'kishins'],
          },
        ],
      },
      {
        type: 'pvp',
        bots: [
          {
            min: 5,
            max: 10,
            type: 'user-hostile',
            displayIds: ['purple', 'kishins'],
          },
        ],
      },
    ],
  },
  type: { type: String, enum: ['width', 'height'], default: 'width' },
  name: { type: String },
});

const CyberiaWorldModel = model('CyberiaWorld', CyberiaWorldSchema);

export { CyberiaWorldSchema, CyberiaWorldModel };
