import { playerAudit } from '../../projects/cyberia/player/player-admin.js';

class CyberiaPlayerAuditService {
  /** GET /?player=<id>&after=<cursor> — one page of the trail of a profile, newest first. */
  static get = async (req, res, options) =>
    await playerAudit({ player: req.query.player, after: req.query.after }, options);
}

export { CyberiaPlayerAuditService };
