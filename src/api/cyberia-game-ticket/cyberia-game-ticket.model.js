/**
 * Mongoose model for `CyberiaGameTicket`: one single-use game launch ticket.
 *
 * The document holds the SHA-256 hash of the ticket, never the ticket. The principal is an account,
 * which plays its persistent profile, or a guest, which plays an ephemeral session. The world
 * (`instanceCode`) is the audience: a server of another world refuses it. A consumed ticket keeps
 * the connection that consumed it, so a retry of that connection reads the same result.
 *
 * @module src/api/cyberia-game-ticket/cyberia-game-ticket.model.js
 */

import { Schema, model } from 'mongoose';

/** Seconds a ticket stays readable after it expires, for a late retry of its consumption. */
const TICKET_RETENTION_SECONDS = 300;

/** Who a ticket launches: an account or a guest. */
const TICKET_PRINCIPALS = Object.freeze(['account', 'guest']);

function isAccount() {
  return this.principal === 'account';
}

function isGuest() {
  return this.principal === 'guest';
}

const CyberiaGameTicketSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    principal: { type: String, enum: TICKET_PRINCIPALS, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: isAccount },
    // The `User.activeSessions` entry that asked for the ticket. Its end revokes the ticket.
    session: { type: Schema.Types.ObjectId, required: isAccount },
    // The GuestService identity that asked for the ticket. Its expiry revokes the ticket.
    guest: { type: String, required: isGuest },
    // A resume ticket: the profile epoch it continues. A newer session of the profile voids it.
    epoch: { type: Number, default: null },
    instanceCode: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    // The WebSocket connection id that consumed the ticket.
    connection: { type: String, default: '' },
  },
  { timestamps: true },
);

CyberiaGameTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: TICKET_RETENTION_SECONDS });
// AcquirePlayerSession finds the ticket of its connection.
CyberiaGameTicketSchema.index(
  { connection: 1 },
  { unique: true, partialFilterExpression: { connection: { $gt: '' } } },
);
// The cap on open tickets counts the tickets of one account or one guest.
CyberiaGameTicketSchema.index({ user: 1 });
CyberiaGameTicketSchema.index({ guest: 1 }, { sparse: true });

const CyberiaGameTicketModel = model('CyberiaGameTicket', CyberiaGameTicketSchema);

const ProviderSchema = CyberiaGameTicketSchema;

export { CyberiaGameTicketSchema, CyberiaGameTicketModel, ProviderSchema, TICKET_PRINCIPALS, TICKET_RETENTION_SECONDS };
