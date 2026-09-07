/**
 * Mongoose model for `CyberiaClientHints`, the per-instance presentation
 * overrides. Editor flows write it; the game client reads it over REST. The
 * simulation never touches it.
 *
 * Schema scope: visual fields only. A field that changes the simulation
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
    // Instance code, matching CyberiaInstance.code. Unique: one hint set per code.
    code: { type: String, required: true, unique: true, index: true },

    // Palette overrides. An absent key keeps the client default.
    palette: { type: [PaletteEntrySchema], default: [] },

    // Optional per-entity-type color-key overrides.
    entityColorKeys: { type: [EntityColorKeySchema], default: [] },

    // Optional status-icon visual overrides (id → iconId + borderColor).
    statusIcons: { type: [StatusIconHintSchema], default: [] },

    // Camera, viewport and cell-size tunings. null keeps the
    // SharedDefaultsCyberia.RENDER_DEFAULTS value.
    cellSize: { type: Number, default: null },
    defaultObjWidth: { type: Number, default: null },
    defaultObjHeight: { type: Number, default: null },
    cameraSmoothing: { type: Number, default: null },
    cameraZoom: { type: Number, default: null },
    defaultWidthScreenFactor: { type: Number, default: null },
    defaultHeightScreenFactor: { type: Number, default: null },
    interpolationMs: { type: Number, default: null },
    devUi: { type: Boolean, default: null },

    // Main UI font: TTF file name under engine assets/fonts/ (null = client
    // built-in font) and a uniform text-size multiplier.
    fontFamily: { type: String, default: null },
    fontFactorSize: { type: Number, default: null },
  },
  { timestamps: true },
);

const CyberiaClientHintsModel = model('CyberiaClientHints', CyberiaClientHintsSchema);

const ProviderSchema = CyberiaClientHintsSchema;

export { CyberiaClientHintsSchema, CyberiaClientHintsModel, ProviderSchema };
