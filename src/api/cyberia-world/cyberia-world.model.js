import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaWorldSchema = new Schema({
  face: [
    {
      type: Schema.Types.ObjectId,
      ref: 'World',
    },
  ],
  name: { type: String },
});

const CyberiaWorldModel = model('CyberiaWorld', CyberiaWorldSchema);

export { CyberiaWorldSchema, CyberiaWorldModel };
