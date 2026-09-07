import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// CyberiaEntityTypeDefault — DB-backed, editable mirror of the per-entity-type
// item defaults that ship in cyberia-server-defaults.js (ENTITY_TYPE_DEFAULTS).
// A document binds an entity category (entityType) to the item ids the runtime
// rotates through by lifecycle state:
//   liveItemIds       — ObjectLayer item ids while the entity is alive.
//   deadItemIds       — ids swapped in on death / ghost state.
//   dropItemIds       — ids granted to the killer on depletion (resources).
//   inventoryItemsIds     — ids the entity carries but no lifecycle state activates.
//   overrideItemsIdsState — per-id overrides of what the lists would otherwise derive.
//
// The three lifecycle lists are discriminators, not separate inventories. The entity holds one
// inventory — the union of all four lists — and the runtime activates the slots the context
// calls for. An id's active flag and quantity follow from the list it belongs to, so neither is
// stored per row — `overrideItemsIdsState` is the one exception, and it only ever adjusts an id
// the lists already carry. See resolveEntityInventory() in cyberia-server-defaults.js.
//
// Resolution: a document matches an entity when every one of its `liveItemIds`
// is in the entity's active item ids. The most specific match wins, the document
// that requires the largest item set. Its remaining lists then drive the entity
// through its states. So one skin can map to different defaults by its full
// active set, e.g.
//   { bot, liveItemIds:[purple, atlas_pistol_mk2], behavior:hostile }
//   { bot, liveItemIds:[purple],                    behavior:passive }
// where a purple bot carrying the pistol is hostile and a bare purple bot is
// passive. The simulation applies the same rule.
//
// Invariants:
//   - `entityType` is a label, not a unique key — a category appears in many
//     documents.
//   - There is NO per-itemId uniqueness: the same itemId may appear in the
//     `liveItemIds` of many documents (different entity types, or the same type
//     at different specificity levels). `liveItemIds` is indexed (non-unique
//     multikey) only for fast membership lookups.

// Overrides what the lists derive for one carried id: `active` forces the spawn state (a skin the
// equipment rules would otherwise leave inactive), `quantity` sizes a stack (a drop bundle).
// Omitting `active` keeps the derived value; an id no list carries is ignored.
const OverrideItemStateSchema = new Schema(
  {
    itemId: { type: String, trim: true },
    active: { type: Boolean },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false },
);

const CyberiaEntityTypeDefaultSchema = new Schema(
  {
    entityType: { type: String, required: true, trim: true },
    liveItemIds: { type: [{ type: String, trim: true }], index: true },
    deadItemIds: [{ type: String, trim: true }],
    dropItemIds: [{ type: String, trim: true }],
    inventoryItemsIds: [{ type: String, trim: true }],
    overrideItemsIdsState: [OverrideItemStateSchema],
    // Canonical entity behavior bound to entities matched by liveItemIds (see
    // SharedDefaultsCyberia.ENTITY_BEHAVIORS). Empty = let the runtime derive it
    // (armed → hostile, else passive). The simulation resolves it with the same
    // liveItemIds match it uses for the live/dead/drop sets.
    behavior: { type: String, trim: true },
  },
  {
    timestamps: true,
  },
);

const CyberiaEntityTypeDefaultModel = model('CyberiaEntityTypeDefault', CyberiaEntityTypeDefaultSchema);

const ProviderSchema = CyberiaEntityTypeDefaultSchema;

export { CyberiaEntityTypeDefaultSchema, CyberiaEntityTypeDefaultModel, ProviderSchema };
