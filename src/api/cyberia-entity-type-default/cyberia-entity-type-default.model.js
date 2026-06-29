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
// Invariants:
//   - `entityType` is a NON-unique, NON-indexed label: a category may appear in
//     many documents (e.g. resource wood-1 / wood-2 / sap, or one document per
//     skin variant), and resolution never keys off it.
//   - `liveItemIds` is the lookup key, so every itemId may appear in `liveItemIds`
//     of AT MOST ONE document across the whole collection — two documents (of the
//     same or different entityType) sharing a live itemId would make the lookup
//     ambiguous. Documents with an empty `liveItemIds` carry no lookup key and are
//     exempt. Enforced in the API service (writes) and the seed runner; indexed
//     (non-unique multikey) for fast membership lookup.

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
  },
  {
    timestamps: true,
  },
);

const CyberiaEntityTypeDefaultModel = model('CyberiaEntityTypeDefault', CyberiaEntityTypeDefaultSchema);

const ProviderSchema = CyberiaEntityTypeDefaultSchema;

export { CyberiaEntityTypeDefaultSchema, CyberiaEntityTypeDefaultModel, ProviderSchema };
