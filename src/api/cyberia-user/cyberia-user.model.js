import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaUserSchema = new Schema({
  x: { type: Number },
  y: { type: Number },
  dim: { type: Number },
  vel: { type: Number },
  maxLife: { type: Number },
  life: { type: Number },
  deadTime: { type: Number },
  skill: {
    basic: { type: String },
    keys: {
      q: { type: String },
      w: { type: String },
      e: { type: String },
      r: { type: String },
    },
  },
  model: {
    user: {
      _id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    world: {
      _id: {
        type: Schema.Types.ObjectId,
        ref: 'CyberiaWorld',
      },
      face: { type: Number },
    },
  },
});

const CyberiaUserModel = model('CyberiaUser', CyberiaUserSchema);

export { CyberiaUserSchema, CyberiaUserModel };
