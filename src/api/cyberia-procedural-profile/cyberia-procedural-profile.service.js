/**
 * CyberiaProceduralProfile service: reads and stores procedural profiles, describes the engine
 * configuration, and answers the palette defaults and random colors of a Genesis Template.
 *
 * @module src/api/cyberia-procedural-profile/cyberia-procedural-profile.service.js
 * @namespace CyberiaProceduralProfileService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { CyberiaProceduralProfileDto } from './cyberia-procedural-profile.model.js';
import { paletteDefaults, proceduralConfig, randomSlots } from '../../projects/cyberia/procedural/spec.js';

class CyberiaProceduralProfileService {
  /**
   * GET `/config`: what a client needs to build a generation request: modes, generators, Genesis
   * Templates, the palette catalog and the limits.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static config = async (req, res, options) =>
    await proceduralConfig({
      CyberiaProceduralProfile: DataBaseProviderService.getModel('CyberiaProceduralProfile', options),
    });

  /**
   * GET `/templates/:id/random-slots`: a random color for each color slot of a Genesis Template.
   * @param {Object} req - Express request.
   * @returns {{slots:Object<string,string>}}
   */
  static randomSlots = (req) => randomSlots(req.params.id);

  /**
   * GET `/templates/:id/palette`: the palette a create starts from with a Genesis Template, under the
   * Palette Template `?paletteId=` names.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{templateId:string,palettes:Object[],slots:Object}>}
   */
  static templatePalette = async (req, res, options) =>
    await paletteDefaults(
      { CyberiaProceduralProfile: DataBaseProviderService.getModel('CyberiaProceduralProfile', options) },
      { templateId: req.params.id, paletteId: req.query.paletteId },
    );

  /**
   * GET `/` (paginated) or `/:profileId` (one profile).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const CyberiaProceduralProfile = DataBaseProviderService.getModel('CyberiaProceduralProfile', options);
    if (req.params.id) {
      return await CyberiaProceduralProfile.resolve(req.params.id);
    }
    const select = CyberiaProceduralProfileDto.select.get();
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
    const [data, total] = await Promise.all([
      CyberiaProceduralProfile.find(query).sort(sort).limit(limit).skip(skip).select(select),
      CyberiaProceduralProfile.countDocuments(query),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };

  /**
   * POST `/`: stores a profile over the one stored under its id.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static post = async (req, res, options) =>
    await DataBaseProviderService.getModel('CyberiaProceduralProfile', options).register(req.body);
}

export { CyberiaProceduralProfileService };
