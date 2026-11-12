import { Schema, model } from 'mongoose';

const CyberiaSagaSchema = new Schema(
  {
    // Unique thematic namespace identifier.
    // Example: "cyberia-saga-neon-frontier"
    code: { type: String, required: true, unique: true, trim: true },

    // Human-readable saga name.
    name: { type: String, required: true },

    // Optional description of the saga, its setting, or narrative theme.
    description: { type: String, default: '' },

    // Content foundation version the saga was composed against.
    foundationVersion: { type: String, default: '' },

    // Ids of the foundation and of other sagas that its definitions name.
    references: { type: [String], default: [] },

    // Semantic definitions the saga adds to the foundation.
    definitions: { type: [Schema.Types.Mixed], default: [] },

    // The maps the saga defines and owns.
    mapCodes: { type: [String], default: [] },

    // The maps of other sources the saga plays on. Their owner stays the source that defines them.
    placeCodes: { type: [String], default: [] },

    // Item labels the saga's references and definitions run on.
    itemIds: { type: [String], default: [] },

    // Quests that belong to this saga, each paired with the NPC skin item that
    // provides it and the place it is offered at.
    questCodes: {
      type: [
        {
          providerSkinItemId: { type: String, required: true },
          questCode: { type: String, required: true },
          mapCode: { type: String, default: '' },
        },
      ],
      default: [],
    },

    // Actions that belong to this saga, each paired with the NPC skin item the
    // action is mounted on and the place it stands at.
    actionCodes: {
      type: [
        {
          providerSkinItemId: { type: String, required: true },
          actionCode: { type: String, required: true },
          mapCode: { type: String, default: '' },
        },
      ],
      default: [],
    },

    // Publication or visibility status.
    status: { type: String, default: 'unlisted' },

    // User who created the saga.
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const CyberiaSagaModel = model('CyberiaSaga', CyberiaSagaSchema);

const ProviderSchema = CyberiaSagaSchema;

export { CyberiaSagaSchema, CyberiaSagaModel, ProviderSchema };
