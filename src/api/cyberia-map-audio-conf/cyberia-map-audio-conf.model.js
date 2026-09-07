import { Schema, model } from 'mongoose';
import { AUDIO_BUSES } from '../../client/components/cyberia/SharedDefaultsCyberia.js';

// Omitted fields inherit client or map defaults.
const AudioSettingsSchema = new Schema(
  {
    bus: { type: String, enum: AUDIO_BUSES },
    volume: { type: Number, min: 0, max: 1 },
    loop: { type: Boolean },
    crossfadeMs: { type: Number, min: 0, max: 10000 },
    pitch: { type: Number, min: 0.25, max: 4 },
    pan: { type: Number, min: 0, max: 1 },
    priority: { type: Number, min: 0, max: 255, validate: Number.isInteger },
  },
  { _id: false },
);

const EventAudioSchema = new Schema(
  {
    logicEventId: { type: String, required: true, trim: true },
    audioCode: { type: String, required: true, trim: true },
    settings: { type: AudioSettingsSchema, default: () => ({}) },
  },
  { _id: false },
);

const CyberiaMapAudioConfSchema = new Schema(
  {
    // CyberiaMap.code. One audio configuration per map.
    mapCode: { type: String, required: true, trim: true },

    // CyberiaAudio.code played while no event binding is active.
    defaultMusic: { type: String, default: '', trim: true },

    // Logic-event bindings, merged by logicEventId.
    events: { type: [EventAudioSchema], default: [] },

    // Map-wide defaults. A binding's own settings override these.
    settings: { type: AudioSettingsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

CyberiaMapAudioConfSchema.index({ mapCode: 1 }, { unique: true });

const CyberiaMapAudioConfModel = model('CyberiaMapAudioConf', CyberiaMapAudioConfSchema);

const ProviderSchema = CyberiaMapAudioConfSchema;

export {
  AudioSettingsSchema,
  CyberiaMapAudioConfModel,
  CyberiaMapAudioConfSchema,
  EventAudioSchema,
  ProviderSchema,
};
