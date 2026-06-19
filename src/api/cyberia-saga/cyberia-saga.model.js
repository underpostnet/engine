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

    // Complete set of map identifiers that belong to this saga.
    // Any map outside this list is considered external to the saga.
    mapCodes: { type: [String], default: [] },

    // Complete set of item identifiers associated with this saga.
    itemIds: { type: [String], default: [] },

    // Complete set of quest identifiers that belong to this saga,
    // regardless of whether they are roots, branches, optional,
    // hidden, or unlocked later in progression.
    questCodes: { type: [String], default: [] },

    // Publication or visibility status.
    status: { type: String, default: 'unlisted' },

    // User who created the saga.
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

CyberiaSagaSchema.index({ code: 1 });

const CyberiaSagaModel = model('CyberiaSaga', CyberiaSagaSchema);

const ProviderSchema = CyberiaSagaSchema;

export { CyberiaSagaSchema, CyberiaSagaModel, ProviderSchema };
