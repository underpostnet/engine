/**
 * Game launch tickets. The portal asks for one for its account or its guest; a game server of the
 * same world consumes it once. Only the SHA-256 hash of a ticket is stored.
 *
 * @module src/api/cyberia-game-ticket/cyberia-game-ticket.service.js
 * @namespace CyberiaGameTicketService
 */

import crypto from 'crypto';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { hashToken } from '../../server/security/auth.js';
import { DEFAULT_INSTANCE_CODE, worldPathOf } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { worldAvailable } from '../cyberia-server-registry/cyberia-server-registry.service.js';
import { universeCodeOf } from '../cyberia-universe/cyberia-universe.service.js';

/** Open tickets one account or one guest may hold at a time. */
const OPEN_TICKETS_MAX = 5;

/** A ticket is 32 random bytes in base64url. */
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Seconds a ticket stays valid: `CYBERIA_GAME_TICKET_TTL_SECONDS`, default 60, at least 5.
 * @returns {number}
 * @memberof CyberiaGameTicketService
 */
const ticketTtlSeconds = () => Math.max(5, Number(process.env.CYBERIA_GAME_TICKET_TTL_SECONDS) || 60);

const httpError = (message, status) => Object.assign(new Error(message), { status });

/**
 * Seconds a resume ticket stays valid: `CYBERIA_RESUME_TICKET_SECONDS`, default 300, at least 30.
 * The game server issues the next one before it expires.
 * @returns {number}
 * @memberof CyberiaGameTicketService
 */
const resumeTtlSeconds = () => Math.max(30, Number(process.env.CYBERIA_RESUME_TICKET_SECONDS) || 300);

/** Stores the hash of a new ticket that lives `seconds`, and returns the ticket once. */
const insertTicket = async (Ticket, doc, seconds) => {
  const ticket = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + seconds * 1000);
  await Ticket.create({ ...doc, tokenHash: hashToken(ticket), expiresAt });
  return { ticket, expiresAt };
};

/**
 * Makes a ticket for one world: for an account session (`user`, `session`) or for a guest (`guest`).
 * A request that names no world launches the default world. The world needs a live server that
 * takes sessions, and an account needs the world in a universe. `path` is where the world lives on
 * the game client, for the launch to open.
 * @param {{principal: 'account'|'guest', user?: string, session?: string, guest?: string, instanceCode?: string}} params
 * @param {{host: string, path: string}} context
 * @returns {Promise<{ticket: string, expiresAt: Date, path: string}>}
 * @memberof CyberiaGameTicketService
 */
const createGameTicket = async ({ principal, user, session, guest, instanceCode }, context) => {
  const code = (typeof instanceCode === 'string' && instanceCode.trim()) || DEFAULT_INSTANCE_CODE;
  if (!(await DataBaseProviderService.getModel('CyberiaInstance', context).exists({ code })))
    throw httpError(`unknown world "${code}"`, 404);
  if (!(await worldAvailable(code, context))) throw httpError(`world "${code}" has no server taking sessions now`, 503);
  if (principal === 'account' && !(await universeCodeOf(code, context)))
    throw httpError(`world "${code}" belongs to no universe, so it keeps no account progress`, 409);

  const Ticket = DataBaseProviderService.getModel('CyberiaGameTicket', context);
  const holder = principal === 'guest' ? { guest } : { user };
  const open = { ...holder, epoch: null, consumedAt: null, expiresAt: { $gt: new Date() } };
  if ((await Ticket.countDocuments(open)) >= OPEN_TICKETS_MAX) throw httpError('too many open launch tickets', 429);
  const issued = await insertTicket(Ticket, { principal, ...holder, session, instanceCode: code }, ticketTtlSeconds());
  return { ...issued, path: worldPathOf(code) };
};

/**
 * Makes the resume ticket of a live account session: it relaunches the same world while the profile
 * stays at `epoch`. It replaces the open resume tickets of that account session.
 * @param {{user: string, session: string, instanceCode: string, epoch: number}} params
 * @param {{host: string, path: string}} context
 * @returns {Promise<{ticket: string, expiresAt: Date}>}
 * @memberof CyberiaGameTicketService
 */
const createResumeTicket = async ({ user, session, instanceCode, epoch }, context) => {
  const Ticket = DataBaseProviderService.getModel('CyberiaGameTicket', context);
  await Ticket.deleteMany({ user, session, epoch: { $ne: null }, consumedAt: null });
  return await insertTicket(Ticket, { principal: 'account', user, session, instanceCode, epoch }, resumeTtlSeconds());
};

/**
 * Consumes a ticket for one connection. A retry of the same connection answers the first result;
 * any other connection gets `replayed`.
 * @param {{ticket: string, instanceCode: string, connection: string}} params
 * @param {{host: string, path: string}|string} context
 * @returns {Promise<{refusal: string, principal?: string, user?: *, session?: *, guest?: string, epoch?: number}>}
 *   `refusal` is empty when accepted; `epoch` is set on a resume ticket.
 * @memberof CyberiaGameTicketService
 */
const consumeGameTicket = async ({ ticket, instanceCode, connection }, context) => {
  if (!TICKET_PATTERN.test(String(ticket)) || !connection) return { refusal: 'unknown' };
  const Ticket = DataBaseProviderService.getModel('CyberiaGameTicket', context);
  const tokenHash = hashToken(ticket);
  const now = new Date();
  const consumed = await Ticket.findOneAndUpdate(
    { tokenHash, consumedAt: null, expiresAt: { $gt: now }, instanceCode },
    { $set: { consumedAt: now, connection } },
    { returnDocument: 'after' },
  ).lean();
  const doc = consumed ?? (await Ticket.findOne({ tokenHash }).lean());
  if (!doc) return { refusal: 'unknown' };
  if (!consumed && doc.connection !== connection) {
    if (doc.consumedAt) return { refusal: 'replayed' };
    if (doc.instanceCode !== instanceCode) return { refusal: 'wrong_instance' };
    return { refusal: 'expired' };
  }
  const { principal, user, session, guest, epoch } = doc;
  return { refusal: '', principal, user, session, guest, epoch };
};

/**
 * The stored ticket of a ticket string, consumed or not, or null.
 * @param {string} ticket
 * @param {{host: string, path: string}|string} context
 * @memberof CyberiaGameTicketService
 */
const findGameTicket = async (ticket, context) =>
  TICKET_PATTERN.test(String(ticket))
    ? await DataBaseProviderService.getModel('CyberiaGameTicket', context)
        .findOne({ tokenHash: hashToken(ticket) })
        .lean()
    : null;

/**
 * The consumed ticket of one connection, or null.
 * @param {string} connection
 * @param {{host: string, path: string}|string} context
 * @memberof CyberiaGameTicketService
 */
const ticketOfConnection = async (connection, context) =>
  connection
    ? await DataBaseProviderService.getModel('CyberiaGameTicket', context).findOne({ connection }).lean()
    : null;

export { createGameTicket, createResumeTicket, consumeGameTicket, findGameTicket, ticketOfConnection };
