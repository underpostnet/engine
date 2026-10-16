import { controllerHandler, sendSuccess } from '../../server/network/middlewares.js';
import { GuestService } from '../user/guest.service.js';
import { createGameTicket } from './cyberia-game-ticket.service.js';

const refused = (message, status) => Object.assign(new Error(message), { status });

/** The principal of a request: a live guest identity, or an account session. */
const principalOf = async (auth, options) => {
  if (auth.role === 'guest') {
    if (!(await GuestService.find(auth._id, options))) throw refused('the guest session expired', 401);
    return { principal: 'guest', guest: auth._id };
  }
  if (auth.service || !auth.jwtid) throw refused('a game launch needs a portal session', 403);
  return { principal: 'account', user: auth._id, session: auth.jwtid };
};

class CyberiaGameTicketController {
  /**
   * POST / — a launch ticket for the session of the request: an account or a guest. The body is
   * `{ instanceCode }`; without one, the default world.
   */
  static post = controllerHandler(async (req, res, options) => {
    const principal = await principalOf(req.auth.user, options);
    const result = await createGameTicket({ ...principal, instanceCode: req.body?.instanceCode }, options);
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, result);
  });
}

export { CyberiaGameTicketController };
