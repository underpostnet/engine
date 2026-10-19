import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import {
  accountAppearances,
  appearanceCids,
  appearancePreview,
} from '../../projects/cyberia/player/appearance-preview.js';

const failure = (status, message) => Object.assign(new Error(message), { status });

class CyberiaPlayerService {
  static get = async (req, res, options) => {
    const CyberiaPlayer = DataBaseProviderService.getModel('CyberiaPlayer', options);
    if (req.params.id) return await CyberiaPlayer.findById(req.params.id).lean();
    return await DataQuery.findPage(CyberiaPlayer, req.query);
  };

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
