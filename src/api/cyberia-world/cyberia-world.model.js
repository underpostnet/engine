import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaWorldSchema = new Schema({
  face: [
    {
      _id: {
        type: Schema.Types.ObjectId,
        ref: 'CyberiaBiome',
      },
      biome: { type: String },
    },
  ],
  name: { type: String },
});

const CyberiaWorldModel = model('CyberiaWorld', CyberiaWorldSchema);

export { CyberiaWorldSchema, CyberiaWorldModel };
