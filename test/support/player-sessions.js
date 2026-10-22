/**
 * Players of the player-service suites: signed-in accounts, portal guests, launches and gameplay
 * sessions of a host, and the stacks and the empty state a commit carries. Load the player models
 * of the host first; mock Valkey with `valkey-memory.js` for guests.
 *
 * @module test/support/player-sessions.js
 */
import { DataBaseProviderService } from '../../src/db/DataBaseProvider.js';
import { GuestService } from '../../src/api/user/guest.service.js';
import { createGameTicket } from '../../src/api/cyberia-game-ticket/cyberia-game-ticket.service.js';
import { acquireSession, consumeLaunch } from '../../src/projects/cyberia/player/player-session.js';

/**
 * The player factories of one host.
 * @param {{host: string, path: string}} context
 */
export const playerSessions = (context) => {
  let usernames = 0;
  let connections = 0;

  /** A signed-in account: the user and the `activeSessions` entry of its portal session. */
  const account = async (extra = {}) => {
    const n = ++usernames;
    const user = await DataBaseProviderService.getModel('User', context).create({
      email: `player${n}@cyberia.test`,
      username: `player${n}`,
      role: 'user',
      activeSessions: [
        { tokenHash: `hash-${n}`, expiresAt: new Date(Date.now() + 60000), host: context.host, path: '/' },
      ],
      ...extra,
    });
    return { principal: 'account', user: String(user._id), session: String(user.activeSessions[0]._id) };
  };

  /** A portal guest: its GuestService identity, as a ticket names it. */
  const guest = async () => {
    const { user } = await GuestService.create({ ip: '127.0.0.1', headers: { 'user-agent': 'test' } }, context);
    return { principal: 'guest', guest: user._id };
  };

  /** A launch from the portal to a game server of a world: the ticket, consumed by a new connection. */
  const launch = async (who, instanceCode = 'w1') => {
    const { ticket } = await createGameTicket({ ...who, instanceCode }, context);
    const connectionId = `conn-${++connections}`;
    return { ticket, connectionId, consumed: await consumeLaunch({ ticket, instanceCode, connectionId }, context) };
  };

  /** A gameplay session of a world: the launch and the lease of its connection. */
  const play = async (who, instanceCode = 'w1') => {
    const { connectionId } = await launch(who, instanceCode);
    return {
      connectionId,
      ...(await acquireSession({ connectionId, instanceCode, serverId: 'server-a' }, context)),
    };
  };

  return { account, guest, launch, play };
};

export const stack = (itemId, slot, quantity = 1, olCid = `cid-${itemId}`) => ({
  itemId,
  olCid,
  quantity,
  slot,
  active: false,
});

export const emptyState = () => ({
  coins: 0,
  xp: 0,
  bag: [],
  storage: [],
  vaults: [],
  held: [],
  quests: [],
  position: { mapCode: '', x: 0, y: 0, seq: 0 },
});
