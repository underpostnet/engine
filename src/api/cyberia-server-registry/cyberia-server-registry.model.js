/**
 * Mongoose model for `CyberiaServerRegistry`.
 *
 * One document per live game server, keyed by the public URL players dial.
 * A server reports itself at startup and on every heartbeat; the report
 * upserts its document. Mongo removes a document SERVER_TTL_SECONDS after the
 * last report.
 *
 * There is no session state. The document is the liveness record, the report
 * is idempotent, and the TTL index is the only cleanup: no sweeper, no
 * connection to track, no disconnect event to miss.
 *
 * Written through POST /api/cyberia-server-registry, read through GET on the
 * same path.
 *
 * @module src/api/cyberia-server-registry/cyberia-server-registry.model.js
 */

import { Schema, model } from 'mongoose';

/** A server reports every 60 s. Three missed reports drop it from the list. */
const SERVER_TTL_SECONDS = 180;

const CyberiaServerRegistrySchema = new Schema(
  {
    // Public origin the client dials, with the variant sub-path when the
    // deploy uses one ("https://server.cyberiaonline.com/FOREST"). This is
    // the registry key: one document per deployed server.
    serverUrl: { type: String, required: true, unique: true, trim: true },

    // CyberiaInstance.code this server simulates.
    instanceCode: { type: String, default: '', trim: true },

    // Operator label for the list. Empty falls back to instanceCode.
    name: { type: String, default: '', trim: true },

    // Every report rewrites this. The TTL index reads it, so a report restarts
    // the countdown and a silent server expires on its own.
    lastSeen: { type: Date, default: Date.now, expires: SERVER_TTL_SECONDS },
  },
  { timestamps: true },
);

const CyberiaServerRegistryModel = model('CyberiaServerRegistry', CyberiaServerRegistrySchema);

const ProviderSchema = CyberiaServerRegistrySchema;

export { CyberiaServerRegistrySchema, CyberiaServerRegistryModel, ProviderSchema, SERVER_TTL_SECONDS };
