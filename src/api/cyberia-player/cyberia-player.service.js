import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import {
  accountAppearances,
  appearanceCids,
  appearancePreview,
} from '../../projects/cyberia/player/appearance-preview.js';
import { endSession, listPlayers, playerDetail } from '../../projects/cyberia/player/player-admin.js';

const failure = (status, message) => Object.assign(new Error(message), { status });

class CyberiaPlayerService {
  /** GET /:id — the detail of one profile; GET /?q&universeCode&status&after&limit — one page of profiles. */
  static get = async (req, res, options) =>
    req.params.id ? await playerDetail(req.params.id, options) : await listPlayers(req.query, options);

  /** POST /:id/session/end {operationId, reason, epoch} — ends the live session of a profile. */
  static endSession = async (req, res, options) =>
    await endSession(
      {
        playerId: req.params.id,
        operationId: req.body?.operationId,
        reason: req.body?.reason,
        epoch: req.body?.epoch,
        actor: req.auth.user._id,
      },
      options,
    );

  /** GET /appearance/v<version>/:cids — the identity preview a reference names, for good. */
  static appearance = async (req, res, options) => {
    const { fingerprint, png } = await appearancePreview(appearanceCids(req.params.cids), options);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return {
      buffer: png,
      mimetype: 'image/png',
      name: `appearance-${fingerprint.slice(0, 16)}.png`,
      etag: fingerprint,
    };
  };

  /** GET /identity/:name — the reference of the preview of what the account named wears now. */
  static identity = async (req, res, options) => {
    const user = await DataBaseProviderService.getModel('User', options)
      .findOne({ username: String(req.params.name), role: { $ne: 'guest' } }, { _id: 1 })
      .lean();
    const reference = user ? (await accountAppearances([user._id], options)).get(String(user._id)) : '';
    if (!reference) throw failure(404, `No appearance for ${req.params.name}`);
    return reference;
  };
}

export { CyberiaPlayerService };
