/**
 * Mongoose model for `CyberiaClientHints`.
 *
 * Dedicated collection for per-instance presentation overrides.
 *
 * Ownership:
 *   - Read by:  cyberia-client (via /api/cyberia-client-hints/:code), CMS UIs.
 *   - Written by: CMS / editor flows. The Cyberia simulation server
 *                 never reads or writes this collection.
 *   - Cacheable: yes — the service layer keeps an in-memory TTL cache.
 *
 * Schema scope: purely visual fields. Anything that influences simulation
 * belongs in `CyberiaInstanceConf`.
 *
 * @module src/api/cyberia-client-hints/cyberia-client-hints.model.js
 */

import { Schema, model } from 'mongoose';

const ColorRgbaSchema = new Schema(
    {
        r: { type: Number, default: 0 },
        g: { type: Number, default: 0 },
        b: { type: Number, default: 0 },
        a: { type: Number, default: 255 },
    },
    { _id: false },
);

const PaletteEntrySchema = new Schema(
    {
        key: { type: String, required: true },
        r: { type: Number, default: 0 },
        g: { type: Number, default: 0 },
        b: { type: Number, default: 0 },
        a: { type: Number, default: 255 },
    },
    { _id: false },
);

const StatusIconHintSchema = new Schema(
    {
        id: { type: Number, required: true },
        iconId: { type: String, default: '' },
        bounce: { type: Boolean, default: false },
        borderColor: { type: ColorRgbaSchema, default: () => ({ r: 100, g: 100, b: 100, a: 200 }) },
    },
    { _id: false },
);

const EntityColorKeySchema = new Schema(
    {
        entityType: { type: String, required: true },
        colorKey: { type: String, required: true },
    },
    { _id: false },
);

const CyberiaClientHintsSchema = new Schema(
    {
        // Instance code this hint set is scoped to. Matches CyberiaInstance.code
        // and CyberiaInstanceConf.instanceCode. Indexed and unique to make the
        // service-layer cache a 1-to-1 keyed lookup.
        code: { type: String, required: true, unique: true, index: true },

        // Optional palette overrides. Keys not present here fall back to the
        // client's compile-time defaults.
        palette: { type: [PaletteEntrySchema], default: [] },

        // Optional per-entity-type color-key overrides.
        entityColorKeys: { type: [EntityColorKeySchema], default: [] },

        // Optional status-icon visual overrides (id → iconId + borderColor).
        statusIcons: { type: [StatusIconHintSchema], default: [] },

        // Camera, viewport, and cell-sizing tunings — null/undefined means
        // "use the SharedDefaultsCyberia.RENDER_DEFAULTS value".
        cellSize: { type: Number, default: null },
        defaultObjWidth: { type: Number, default: null },
        defaultObjHeight: { type: Number, default: null },
        cameraSmoothing: { type: Number, default: null },
        cameraZoom: { type: Number, default: null },
        defaultWidthScreenFactor: { type: Number, default: null },
        defaultHeightScreenFactor: { type: Number, default: null },
        interpolationMs: { type: Number, default: null },
        devUi: { type: Boolean, default: null },
    },
    { timestamps: true },
);

const CyberiaClientHintsModel = model('CyberiaClientHints', CyberiaClientHintsSchema);

const ProviderSchema = CyberiaClientHintsSchema;

export {
    CyberiaClientHintsSchema,
    CyberiaClientHintsModel,
    ProviderSchema,
};
