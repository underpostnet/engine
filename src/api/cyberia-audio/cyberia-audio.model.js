/**
 * One audio asset: what it is, never when it plays.
 *
 * The asset carries its identity (`code`), its bytes (`fileId`) and the manifest the recorder
 * wrote beside them. It holds no classification of its own: whether a sound behaves as a bed, a
 * one-shot or a transition is a property of the context that binds it — see
 * cyberia-map-audio-conf — not of the asset, which the same map or several maps may reuse.
 *
 * @module src/api/cyberia-audio/cyberia-audio.model.js
 * @namespace CyberiaAudioModelServer
 */

import { Schema, model } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

// Mirrors the `<name-out>.json` manifest the cyberia-audio package writes beside every recorded
// WAV. `defaults` and `parameters` are the asset's own parameter contract, so they stay
// free-form: each asset owns its parameter names and ranges.
const ManifestSchema = new Schema(
  {
    id: { type: String, required: true },
    // The bus the module was authored on — `src/audio-module/<bus-id>/` in the cyberia-audio
    // package, and the same vocabulary a binding's `settings.bus` selects. It is the asset's
    // natural route, not a decision: a map binding chooses where an asset actually plays.
    bus: { type: String, default: '', trim: true },
    tags: [{ type: String }],
    author: { type: String, required: true },
    version: { type: String, required: true },
    duration: { type: Number, required: true },
    sampleRate: { type: Number },
    channels: { type: Number },
    loop: { type: Boolean, default: false },
    audio: { type: String, default: '' },
    defaults: { type: Schema.Types.Mixed, default: {} },
    parameters: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const CyberiaAudioSchema = new Schema(
  {
    // The asset's canonical identity across the platform: what a map binding, an import and an
    // export all refer to. It is unique on its own, so a reference needs nothing beside it.
    code: { type: String, required: true, trim: true },
    fileId: { type: Schema.Types.ObjectId, ref: 'File' },
    manifest: { type: ManifestSchema, required: true },
  },
  {
    timestamps: true,
  },
);

// Declared here rather than as `index: true` on the field, so the unique index is defined once.
CyberiaAudioSchema.index({ code: 1 }, { unique: true });

const CyberiaAudioModel = model('CyberiaAudio', CyberiaAudioSchema);

const ProviderSchema = CyberiaAudioSchema;

export { CyberiaAudioSchema, CyberiaAudioModel, ProviderSchema };
