import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// CyberiaEntityTypeDefault — DB-backed, editable mirror of the per-entity-type
// item defaults that ship in cyberia-server-defaults.js (ENTITY_TYPE_DEFAULTS).
// A document binds an entity category (entityType) to the item ids the runtime
// rotates through by lifecycle state:
//   liveItemIds          — ObjectLayer item ids while the entity is alive.
//   deadItemIds          — ids swapped in on death / ghost state.
//   dropItemIds          — ids granted to the killer on depletion (resources).
//   defaultObjectLayers  — seed inventory rows ({ itemId, active, quantity }).
//
// Resolution rule (authoritative): defaults are looked up by the entity's ACTIVE
// itemId (usually the skin) — the system finds the document whose `liveItemIds`
// contains that itemId, then applies the document's deadItemIds / dropItemIds /
// defaultObjectLayers to drive what is shown as the entity's state changes.
//
// Resolution (subset matching): a document matches an entity when ALL of its
// `liveItemIds` are present in the entity's active item ids, and the MOST SPECIFIC
// match wins — the document requiring the largest item set. This lets the same
// skin map to different defaults by its full active set, e.g.
//   { bot, liveItemIds:[purple, atlas_pistol_mk2], behavior:hostile }
//   { bot, liveItemIds:[purple],                    behavior:passive }
// where a purple bot carrying the pistol is hostile and a bare purple bot is
// passive. The Go simulation (game/entity_defaults.go) implements the same rule.
//
// Invariants:
//   - `entityType` is a label, not a unique key — a category appears in many
//     documents.
//   - There is NO per-itemId uniqueness: the same itemId may appear in the
//     `liveItemIds` of many documents (different entity types, or the same type
//     at different specificity levels). `liveItemIds` is indexed (non-unique
//     multikey) only for fast membership lookups.

const ObjectLayerDefaultSchema = new Schema(
  {
    itemId: { type: String, required: true, trim: true },
    active: { type: Boolean, default: false },
    quantity: { type: Number, default: 0 },
  },
  { _id: false },
);

const CyberiaEntityTypeDefaultSchema = new Schema(
  {
    entityType: { type: String, required: true, trim: true },
    liveItemIds: { type: [{ type: String, trim: true }], index: true },
    deadItemIds: [{ type: String, trim: true }],
    dropItemIds: [{ type: String, trim: true }],
    defaultObjectLayers: [ObjectLayerDefaultSchema],
    // Canonical entity behavior bound to entities matched by liveItemIds (see
    // SharedDefaultsCyberia.ENTITY_BEHAVIORS). Empty = let the runtime derive it
    // (armed → hostile, else passive). The Go simulation resolves this with the
    // same liveItemIds matching used for the live/dead/drop sets.
    behavior: { type: String, trim: true },
  },
  {
    timestamps: true,
  },
);

const CyberiaEntityTypeDefaultModel = model('CyberiaEntityTypeDefault', CyberiaEntityTypeDefaultSchema);

const ProviderSchema = CyberiaEntityTypeDefaultSchema;

export { CyberiaEntityTypeDefaultSchema, CyberiaEntityTypeDefaultModel, ProviderSchema };
