import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaInstanceSchema = new Schema({
  name: { type: String },
  type: { type: String, enum: ['pvp', 'pve'] },
  bots: {
    type: [
      {
        behavior: {
          type: String,
          enum: ['user-hostile', 'quest-passive', 'item-quest', 'pet', 'generic-people', 'resource'],
        },
        displayIds: [
          {
            id: { type: String },
            quantity: [{ type: Number }],
            displayData: [
              {
                id: { type: String },
                x: { type: Number },
                y: { type: Number },
                positionId: { type: String },
              },
            ],
            name: { type: String },
            title: { type: String },
            parentId: { type: String },
          },
        ],
      },
    ],
  },
});

const CyberiaInstanceDto = {
  select: {
    lite: () => {
      return { _id: 1, name: 1 };
    },
  },
};

const CyberiaInstanceModel = model('CyberiaInstance', CyberiaInstanceSchema);

const ProviderSchema = CyberiaInstanceSchema;

export { CyberiaInstanceSchema, CyberiaInstanceModel, ProviderSchema, CyberiaInstanceDto };
