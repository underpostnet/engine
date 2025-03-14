import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const DisplaySearchObjectsSchema = new Schema({
  id: { type: String },
  quantity: { type: Number },
  current: { type: Number, default: 0 },
  step: { type: Number, default: 0 },
  delivery: { type: Boolean },
  actionIcon: { type: String },
  panelQuestIcons: [{ type: String }],
});

const CyberiaQuestSchema = new Schema({
  id: { type: String },
  sagaId: { type: String },
  maxStep: { type: Number },
  displaySearchObjects: {
    type: [DisplaySearchObjectsSchema],
    default: [],
  },
  provide: {
    displayIds: [
      {
        id: { type: String },
        itemType: { type: String },
        quantity: [{ type: Number }],
        stepData: [
          {
            image: { type: String },
            imageStyle: { type: Schema.Types.Mixed },
            bubble: {
              type: Boolean,
              default: false,
            },
            completeDialog: {
              es: { type: String },
              en: { type: String },
            },
            customTargetDisplayId: { type: String },
            customMainDisplayId: { type: String },
            talkingDialog: [
              {
                image: { type: String },
                dialog: {
                  es: { type: String },
                  en: { type: String },
                },
              },
            ],
          },
        ],
      },
    ],
  },
  reward: [
    {
      type: { type: String },
      quantity: { type: Number },
    },
  ],
  icon: {
    folder: { type: String },
    id: { type: String },
  },
  title: {
    es: { type: String },
    en: { type: String },
  },
  shortDescription: {
    es: { type: String },
    en: { type: String },
  },
  description: {
    es: { type: String },
    en: { type: String },
  },
  descriptionBubble: {
    type: Boolean,
    default: false,
  },
  successDescription: {
    es: { type: String },
    en: { type: String },
  },
  successDescriptionBubble: {
    type: Boolean,
    default: false,
  },
  nextQuestIds: [{ id: { type: String }, sagaId: { type: String } }],
  prevQuestIds: [{ id: { type: String }, sagaId: { type: String } }],
  components: [
    {
      id: { type: String },
      questKeyContext: { type: String },
      defaultDialog: {
        es: { type: String },
        en: { type: String },
      },
    },
  ],
});

const CyberiaQuestModel = model('CyberiaQuest', CyberiaQuestSchema);

const QuestStatusSchema = new Schema({
  id: { type: String },
  sagaId: { type: String },
  currentStep: { type: Number, default: 0 },
  complete: { type: Boolean, default: false },
  displaySearchObjects: {
    type: [DisplaySearchObjectsSchema],
    default: [],
  },
});

const ProviderSchema = CyberiaQuestSchema;

export { CyberiaQuestSchema, CyberiaQuestModel, ProviderSchema, QuestStatusSchema };
