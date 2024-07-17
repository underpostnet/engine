import { Schema, model } from 'mongoose';
import { DisplayComponent, PositionsComponent } from '../../client/components/cyberia/CommonCyberia.js';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const DisplaySchema = new Schema({
  displayId: { type: String },
  current: { type: Boolean },
  enabled: { type: Boolean },
  position: { type: String },
  positions: { type: [{ positionId: { type: String }, frames: { type: Number } }] },
  assetFolder: { type: String, default: 'skin' },
  extension: { type: String, default: 'png' },
  velFrame: { type: Number, default: 250 },
});

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
  lifeRegeneration: { type: Number, default: 5 },
  lifeRegenerationVel: { type: Number, default: 1500 },
  behavior: { type: String, default: 'user' },
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
      type: [DisplaySchema],
      default: [
        { enabled: true, current: true, ...DisplayComponent.get['anon']() },
        DisplayComponent.get['eiri'](),
        DisplayComponent.get['ghost'](),
      ],
    },
    weapon: {
      type: [DisplaySchema],
      default: [],
    },
    breastplate: {
      type: [DisplaySchema],
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
    title: { type: Object, default: {} },
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
    quests: {
      type: [
        {
          id: { type: String },
          currentStep: { type: Number, default: 0 },
          complete: { type: Boolean, default: false },
          displaySearchObjects: {
            type: [
              {
                id: { type: String },
                quantity: { type: Number },
                current: { type: Number, default: 0 },
                step: { type: Number, default: 0 },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
  },
});
const CyberiaUserModel = model('CyberiaUser', CyberiaUserSchema);

const ProviderSchema = CyberiaUserSchema;

export { CyberiaUserSchema, CyberiaUserModel, ProviderSchema };
