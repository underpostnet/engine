import { Schema, model } from 'mongoose';
import { PositionsComponent } from '../../client/components/cyberia/CommonCyberia.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const CyberiaUserSchema = new Schema({
  x: { type: Number, default: 1 },
  y: { type: Number, default: 1 },
  dim: { type: Number, default: 1 },
  vel: { type: Number, default: 0.5 },
  maxLife: { type: Number, default: 150 },
  life: { type: Number, default: 150 },
  deadTime: { type: Number, default: 3000 },
  coin: { type: Number, default: 0 },
  cooldown: { type: Number, default: 750 },
  timeLife: { type: Number, default: 300 },
  damage: { type: Number, default: 10 },
  skill: {
    keys: {
      basic: { type: String, default: 'red-power' },
      primary: { type: String },
      secondary: { type: String },
      definitive: { type: String },
    },
    tree: { type: [{ id: { type: String } }], default: [{ id: 'red-power' }] },
  },
  weapon: {
    tree: { type: [{ id: { type: String } }], default: [{ id: 'tim-knife' }] },
  },
  breastplate: {
    tree: { type: [{ id: { type: String } }], default: [] },
  },
  components: {
    skin: {
      type: [
        {
          displayId: { type: String },
          current: { type: Boolean },
          enabled: { type: Boolean },
          position: { type: String },
          positions: { type: [{ positionId: { type: String }, frames: { type: Number } }] },
          assetFolder: { type: String },
          extension: { type: String },
        },
      ],
      default: [
        {
          displayId: 'anon',
          position: '08',
          positions: PositionsComponent.default(),
          enabled: true,
          current: true,
          assetFolder: 'skin',
        },
        {
          displayId: 'eiri',
          position: '08',
          positions: PositionsComponent.default(),
          enabled: false,
          assetFolder: 'skin',
        },
        {
          displayId: 'ghost',
          position: '08',
          positions: PositionsComponent.ghost(),
          enabled: false,
          assetFolder: 'skin',
        },
      ],
    },
    weapon: {
      type: [
        {
          displayId: { type: String },
          current: { type: Boolean },
          enabled: { type: Boolean },
          position: { type: String },
          positions: { type: [{ positionId: { type: String }, frames: { type: Number } }] },
          assetFolder: { type: String },
          extension: { type: String },
        },
      ],
      default: [],
    },
    breastplate: {
      type: [
        {
          displayId: { type: String },
          current: { type: Boolean },
          enabled: { type: Boolean },
          position: { type: String },
          positions: { type: [{ positionId: { type: String }, frames: { type: Number } }] },
          assetFolder: { type: String },
          extension: { type: String },
        },
      ],
      default: [],
    },
    background: {
      type: [{ pixi: { tint: { type: String }, visible: { type: Boolean } }, enabled: { type: Boolean } }],
      default: [{ pixi: { tint: 'blue', visible: true }, enabled: false }],
    },
    lifeBar: { type: Object, default: {} },
    lifeIndicator: { type: Object, default: {} },
    coinIndicator: { type: Object, default: {} },
    username: { type: Object, default: {} },
    pointerArrow: { type: Object, default: {} },
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
