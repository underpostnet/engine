/**
 * Mongoose model for `CyberiaServerRegistry`: one document per live game server process.
 *
 * Replicas of one deployment share its public `url` and keep one document each, under their own
 * `serverId`. Discovery groups them into one logical endpoint per `url`. A process reports at
 * startup and on every heartbeat; `seq` orders its reports, so a late report never undoes a newer
 * one. Mongo removes a document SERVER_TTL_SECONDS after the last report.
 *
 * @module src/api/cyberia-server-registry/cyberia-server-registry.model.js
 */

import { Schema, model } from 'mongoose';

/** A game server reports this often. */
const SERVER_REPORT_SECONDS = 20;

/** Three missed reports drop a process. */
const SERVER_TTL_SECONDS = 60;

/** A ready process takes new sessions; a draining one keeps its players and takes none. */
const SERVER_STATES = Object.freeze(['ready', 'draining']);

const CyberiaServerRegistrySchema = new Schema(
  {
    // One game server process. A restart is a new process.
    serverId: { type: String, required: true, unique: true, trim: true },
    // The public origin players dial, with the base path of the world ("https://server.cyberiaonline.com/test").
    url: { type: String, required: true, trim: true },
    instanceCode: { type: String, required: true, trim: true },
    name: { type: String, default: '', trim: true },
    state: { type: String, enum: SERVER_STATES, required: true },
    seq: { type: Number, required: true, min: 1 },
    // The binary the process runs: replicas of one build speak one protocol.
    build: { type: String, default: '' },
    // The content release its world was built from, '' for the workspace.
    releaseId: { type: String, default: '' },
    startedAt: { type: Date, required: true },
    // Every report rewrites this; the TTL index reads it.
    lastSeen: { type: Date, required: true, expires: SERVER_TTL_SECONDS },
  },
  { timestamps: true },
);

CyberiaServerRegistrySchema.index({ instanceCode: 1, url: 1 });

const CyberiaServerRegistryModel = model('CyberiaServerRegistry', CyberiaServerRegistrySchema);

const ProviderSchema = CyberiaServerRegistrySchema;

export {
  CyberiaServerRegistrySchema,
  CyberiaServerRegistryModel,
  ProviderSchema,
  SERVER_REPORT_SECONDS,
  SERVER_STATES,
  SERVER_TTL_SECONDS,
};
