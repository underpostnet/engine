/**
 * CyberiaContentRelease service: read access to the release ledger. Build, validation,
 * promotion and rollback are operator actions of the `cyberia content-release` CLI.
 *
 * @module src/api/cyberia-content-release/cyberia-content-release.service.js
 * @namespace CyberiaContentReleaseService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CyberiaContentReleaseDto } from './cyberia-content-release.model.js';
import { servedContentArtifact } from '../../projects/cyberia/content-artifact.js';

class CyberiaContentReleaseService {
  /**
   * GET `/active` (the served release, with the database the partition is bound to),
   * `/:releaseId` (one release) or `/` (paginated).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const CyberiaContentRelease = DataBaseProviderService.getModel('CyberiaContentRelease', options);
    const select = CyberiaContentReleaseDto.select.get();
    if (req.path.startsWith('/active')) {
      const active = await CyberiaContentRelease.active();
      const servedDatabase = DataBaseProviderService.servedDatabase(options, 'content');
      const artifact = servedContentArtifact();
      // The runtime serves the promoted release once its partition serves that database and the
      // process reads the content artifact the release holds.
      return {
        release: active,
        servedDatabase,
        artifact,
        serving:
          !!active && servedDatabase === active.database && artifact.releaseId === active.releaseId && !artifact.error,
      };
    }
    if (req.params.id) {
      const release = await CyberiaContentRelease.findOne({ releaseId: req.params.id }).select(select);
      if (!release) throw new Error('Content release not found');
      return release;
    }
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
    const [data, total] = await Promise.all([
      CyberiaContentRelease.find(query).sort(sort).limit(limit).skip(skip).select(select),
      CyberiaContentRelease.countDocuments(query),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };
}

export { CyberiaContentReleaseService };
